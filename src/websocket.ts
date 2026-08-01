import type {
  AsobiWebSocketOptions,
  WsMessage,
  WsEventType,
  WsPayloadMap,
  SendFireOptions,
  MatchState,
  Entity,
} from "./types.js";

type WsCallback = (payload: Record<string, unknown>) => void;
type CidResolver = {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const AUTH_FAILURE_REASONS: ReadonlySet<string> = new Set([
  "invalid_token",
  "session_revoked",
  "idle_auth_timeout",
]);

// Recursive structural equality over JSON-shaped values (what every WS
// payload is). Deliberately not `JSON.stringify` comparison: key insertion
// order on an otherwise-unchanged object (e.g. `{y, x}` one frame, `{x, y}`
// the next) would falsely compare unequal and defeat sendFire's dedupe.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => deepEqual(v, b[i]))
    );
  }
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  return aKeys.length === bKeys.length && aKeys.every((k) => deepEqual(aRec[k], bRec[k]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toEntity(fields: unknown, fallbackId: string): Entity {
  if (isPlainObject(fields)) {
    const id = typeof fields.id === "string" ? fields.id : fallbackId;
    return { ...fields, id };
  }
  return { id: fallbackId };
}

// Best-effort: the `match.state` wire payload has no fixed schema (it is
// whatever the game's `get_state` callback returns), so this looks for the
// two conventions asobi games actually use for a per-id state map -
// `entities` or `players` - as either a JSON object keyed by id or an array
// of state objects. Anything else yields an empty `entities`; `raw` always
// carries the untouched payload regardless.
function toMatchState<T>(payload: Record<string, unknown>): MatchState<T> {
  const tick = typeof payload.tick === "number" ? payload.tick : 0;
  const source = "entities" in payload ? payload.entities : payload.players;

  let entities: Entity[] = [];
  if (Array.isArray(source)) {
    entities = source.map((item, i) => toEntity(item, String(i)));
  } else if (isPlainObject(source)) {
    entities = Object.entries(source).map(([id, fields]) => toEntity(fields, id));
  }

  return { tick, entities, raw: payload as T };
}

export class AsobiWebSocket {
  private readonly url: string;
  private token: string;
  private readonly reconnect: boolean;
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;
  private readonly heartbeatInterval: number;

  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<WsCallback>>();
  private pendingReplies = new Map<string, CidResolver>();
  private cidCounter = 0;
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private authExpired = false;
  private lastFirePayloads = new Map<string, Record<string, unknown>>();
  private warnedDroppedSend = false;

  constructor(options: AsobiWebSocketOptions) {
    this.url = options.url;
    this.token = options.token;
    this.reconnect = options.reconnect ?? true;
    this.reconnectInterval = options.reconnectInterval ?? 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.heartbeatInterval = options.heartbeatInterval ?? 30000;
  }

  connect(): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      this.closed = false;
      this.authExpired = false;
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.warnedDroppedSend = false;
        this.lastFirePayloads.clear();
        this.startHeartbeat();
        this.authenticate()
          .then(resolve)
          .catch((err) => {
            if (this.isAuthFailure(err)) {
              this.failAuth(err.message);
            }
            reject(err);
          });
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.emit("_close", { code: (event as CloseEvent)?.code });
        if ((event as CloseEvent)?.code === 1008 || this.authExpired) {
          this.failAuth("auth_closed");
          return;
        }
        if (this.reconnect && !this.closed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), this.reconnectInterval);
        }
      };

      this.ws.onerror = () => {
        this.emit("_error", {});
      };
    });
  }

  private authenticate(): Promise<Record<string, unknown>> {
    return this.send("session.connect", { token: this.token });
  }

  setToken(token: string): Promise<Record<string, unknown>> | void {
    this.token = token;
    this.authExpired = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.authenticate();
    }
  }

  private isAuthFailure(err: unknown): err is Error {
    return err instanceof Error && AUTH_FAILURE_REASONS.has(err.message);
  }

  private failAuth(reason: string): void {
    this.authExpired = true;
    this.closed = true;
    this.stopHeartbeat();
    this.emit("auth_expired", { reason });
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.ws?.close();
  }

  send(type: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const cid = String(++this.cidCounter);
      const msg: WsMessage = { type, payload, cid };

      const timer = setTimeout(() => {
        this.pendingReplies.delete(cid);
        reject(new Error(`Timeout waiting for reply to ${type} (cid: ${cid})`));
      }, 10000);

      this.pendingReplies.set(cid, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  // Fire-and-forget publish - no reply awaited. This is the primitive used
  // for a per-frame send loop (e.g. match input), so it takes two
  // frame-loop-specific affordances:
  //
  // - `dedupe`: drop the send if `payload` is structurally equal to the
  //   last payload actually sent for this `type`. See `deepEqual`.
  // - Dropped-while-not-open sends warn once (via `console.warn`) instead
  //   of failing silently forever. A naive 60fps integration that starts
  //   sending before `connect()` resolves used to have no signal at all
  //   that its input was going nowhere; the warning resets on every
  //   (re)connect so it can fire again after a dropped connection. Kept as
  //   a single warning rather than a throw or a buffer so existing
  //   callers that don't check `connect()` timing keep working unchanged.
  sendFire(type: string, payload: Record<string, unknown> = {}, options?: SendFireOptions): void {
    if (options?.dedupe) {
      const last = this.lastFirePayloads.get(type);
      if (last !== undefined && deepEqual(last, payload)) {
        return;
      }
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (!this.warnedDroppedSend) {
        this.warnedDroppedSend = true;
        console.warn(
          `[asobi] sendFire("${type}") dropped: WebSocket is not open (has connect() resolved?). ` +
            "This warning fires once per connection.",
        );
      }
      return;
    }

    const msg: WsMessage = { type, payload };
    this.ws.send(JSON.stringify(msg));
    if (options?.dedupe) {
      this.lastFirePayloads.set(type, payload);
    }
  }

  on<K extends keyof WsPayloadMap>(
    event: K,
    callback: (payload: WsPayloadMap[K]) => void,
  ): () => void;
  on(event: WsEventType | (string & {}), callback: WsCallback): () => void;
  on(event: string, callback: WsCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as WsCallback);
    return () => this.listeners.get(event)?.delete(callback as WsCallback);
  }

  off(event: string, callback: WsCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  // Typed convenience over `on("match.state", ...)`. See `MatchState` and
  // `toMatchState` for how `tick`/`entities` are derived from the
  // otherwise-game-defined payload; `T` types `raw`, the untouched payload,
  // for reading game-specific fields the typed view doesn't capture.
  onMatchState<T = unknown>(callback: (state: MatchState<T>) => void): () => void {
    return this.on("match.state", (payload) => {
      callback(toMatchState<T>(payload));
    });
  }

  private handleMessage(raw: string): void {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.cid && this.pendingReplies.has(msg.cid)) {
      const pending = this.pendingReplies.get(msg.cid)!;
      this.pendingReplies.delete(msg.cid);
      clearTimeout(pending.timer);

      if (msg.type === "error") {
        pending.reject(new Error(String(msg.payload.reason ?? "unknown_error")));
      } else {
        pending.resolve(msg.payload);
      }
      return;
    }

    if (this.isAuthFailureMessage(msg)) {
      this.emit(msg.type, msg.payload);
      this.failAuth(String(msg.payload.reason ?? msg.type));
      this.ws?.close();
      return;
    }

    this.emit(msg.type, msg.payload);
  }

  private isAuthFailureMessage(msg: WsMessage): boolean {
    if (msg.type === "session_revoked" || msg.type === "session.revoked") {
      return true;
    }
    return msg.type === "error" && AUTH_FAILURE_REASONS.has(String(msg.payload.reason));
  }

  private emit(event: string, payload: Record<string, unknown>): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
    this.listeners.get("*")?.forEach((cb) => cb({ type: event, ...payload }));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendFire("session.heartbeat");
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
