import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AsobiWebSocket } from "../src/websocket.js";

const OPEN = 1;

class FakeWebSocket {
  static OPEN = OPEN;
  static instances: FakeWebSocket[] = [];
  readyState = OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code?: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.onclose?.({ code: 1000 });
  }
}

function lastSocket(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

function connectMsg(sock: FakeWebSocket) {
  const parsed = sock.sent.map((s) => JSON.parse(s));
  return parsed.find((m) => m.type === "session.connect");
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("websocket auth", () => {
  it("sends the current access token in session.connect", async () => {
    const ws = new AsobiWebSocket({ url: "ws://x", token: "acc1" });
    const p = ws.connect();
    const sock = lastSocket();
    sock.onopen?.();
    const msg = connectMsg(sock)!;
    sock.onmessage?.({ data: JSON.stringify({ type: "session.connected", cid: msg.cid, payload: { player_id: "p1" } }) });
    await p;
    expect(msg.payload.token).toBe("acc1");
  });

  it("re-sends session.connect with a rotated token via setToken", async () => {
    const ws = new AsobiWebSocket({ url: "ws://x", token: "acc1" });
    const p = ws.connect();
    const sock = lastSocket();
    sock.onopen?.();
    const first = connectMsg(sock)!;
    sock.onmessage?.({ data: JSON.stringify({ type: "session.connected", cid: first.cid, payload: {} }) });
    await p;

    const reauth = ws.setToken("acc2") as Promise<Record<string, unknown>>;
    const reMsg = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "session.connect").pop();
    sock.onmessage?.({ data: JSON.stringify({ type: "session.connected", cid: reMsg.cid, payload: {} }) });
    await reauth;
    expect(reMsg.payload.token).toBe("acc2");
  });

  it("stops reconnecting and surfaces auth_expired on session_revoked", async () => {
    const ws = new AsobiWebSocket({ url: "ws://x", token: "acc1", reconnectInterval: 1 });
    const p = ws.connect();
    const sock = lastSocket();
    sock.onopen?.();
    const msg = connectMsg(sock)!;
    sock.onmessage?.({ data: JSON.stringify({ type: "session.connected", cid: msg.cid, payload: {} }) });
    await p;

    let expired: Record<string, unknown> | null = null;
    ws.on("auth_expired", (payload) => { expired = payload; });

    sock.onmessage?.({ data: JSON.stringify({ type: "session_revoked", payload: { reason: "session_revoked" } }) });
    expect(expired).not.toBeNull();

    const before = FakeWebSocket.instances.length;
    sock.onclose?.({ code: 1000 });
    await new Promise((r) => setTimeout(r, 10));
    expect(FakeWebSocket.instances.length).toBe(before);
  });

  it("surfaces auth_expired on a 1008 close and does not reconnect", async () => {
    const ws = new AsobiWebSocket({ url: "ws://x", token: "acc1", reconnectInterval: 1 });
    const p = ws.connect();
    const sock = lastSocket();
    sock.onopen?.();
    const msg = connectMsg(sock)!;
    sock.onmessage?.({ data: JSON.stringify({ type: "session.connected", cid: msg.cid, payload: {} }) });
    await p;

    let expired = false;
    ws.on("auth_expired", () => { expired = true; });

    const before = FakeWebSocket.instances.length;
    sock.onclose?.({ code: 1008 });
    await new Promise((r) => setTimeout(r, 10));
    expect(expired).toBe(true);
    expect(FakeWebSocket.instances.length).toBe(before);
  });
});
