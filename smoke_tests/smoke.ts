// Smoke test for @asobi/client against widgrensit/sdk_demo_backend.
//
// Expects sdk_demo_backend running at ASOBI_URL (default http://localhost:8084)
// with the `demo` mode loaded. See:
//   https://github.com/widgrensit/sdk_demo_backend
// and the canonical spec at SMOKE.md in that repo.
//
// Exits 0 if the 3 canonical scenarios pass, 1 otherwise.

import { Asobi, AsobiWebSocket } from "../src/index.js";

const BASE_URL = process.env.ASOBI_URL ?? "http://localhost:8084";
const MATCH_MODE = "demo";
const STARTUP_TIMEOUT_MS = 60_000;
const MATCH_JOIN_TIMEOUT_MS = 10_000;
const STATE_TIMEOUT_MS = 3_000;
const INITIAL_STATE_TIMEOUT_MS = 3_000;
const X_DELTA_THRESHOLD = 10;

async function main() {
  log("Waiting for sdk_demo_backend at", BASE_URL);
  await waitForServer(BASE_URL);
  log("Backend reachable.");

  // Scenario 1 + 2: register two players, both connect, both queue.
  const [a, b] = await Promise.all([spawnPlayer("a"), spawnPlayer("b")]);
  log("Registered:", a.playerId, "|", b.playerId);

  // Register match.matched listeners BEFORE queueing. Matchmaker-formed
  // matches deliver the event as `match.matched` (the server's atom is
  // mapped via `match_event, matched, ...`). The `match.joined` event
  // only fires for explicit `match.join` client-sent messages.
  const matchedPromises = [
    waitFor(a.ws, "match.matched", MATCH_JOIN_TIMEOUT_MS),
    waitFor(b.ws, "match.matched", MATCH_JOIN_TIMEOUT_MS),
  ];

  await Promise.all([queueMatchmaker(a), queueMatchmaker(b)]);
  log("Both queued.");

  const [matchedA, matchedB] = await Promise.all(matchedPromises);
  log("Both matched, match_id =", matchedA.match_id);

  if (matchedA.match_id !== matchedB.match_id) {
    throw new Error(
      `match_id mismatch: ${matchedA.match_id} vs ${matchedB.match_id}`
    );
  }

  // Scenario 3: capture initial x from the first match.state, then send one
  // match.input and assert a subsequent state shows x advanced past
  // x_initial + threshold. Player spawn x is random in [50, 700], so we
  // must compare against x_initial, never a literal.
  const xInitial = await waitForInitialX(
    a.ws,
    a.playerId,
    INITIAL_STATE_TIMEOUT_MS
  );
  log("Initial x =", xInitial);

  const statePromise = waitForXAdvanced(
    a.ws,
    a.playerId,
    xInitial,
    X_DELTA_THRESHOLD,
    STATE_TIMEOUT_MS
  );
  a.ws.sendFire("match.input", { data: { move_x: 1, move_y: 0 } });

  const myPos = await statePromise;
  log(
    `match.state confirmed: x = ${myPos.x} (initial ${xInitial}, delta ${
      myPos.x - xInitial
    })`
  );

  a.ws.close();
  b.ws.close();
  log("PASS");
}

// ---- helpers ----

type Player = {
  label: string;
  playerId: string;
  ws: AsobiWebSocket;
};

async function spawnPlayer(label: string): Promise<Player> {
  const asobi = new Asobi({ baseUrl: BASE_URL });
  const username = `smoke_${label}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const { player_id, session_token } = await asobi.auth.register({
    username,
    password: "smoke_pw_12345",
    display_name: username,
  });
  const ws = asobi.websocket({ token: session_token });
  if (process.env.SMOKE_DEBUG) {
    ws.on("*", (p) => log(`[${label}] ←`, JSON.stringify(p).slice(0, 200)));
  }
  await ws.connect();
  return { label, playerId: player_id, ws };
}

async function queueMatchmaker(p: Player): Promise<void> {
  const queued = waitFor(p.ws, "matchmaker.queued", 5_000);
  p.ws.sendFire("matchmaker.add", { mode: MATCH_MODE });
  await queued;
}

function waitFor(
  ws: AsobiWebSocket,
  event: string,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: Record<string, unknown>) => {
      clearTimeout(timer);
      ws.off(event, handler);
      resolve(payload);
    };
    ws.on(event, handler);
  });
}

function waitForInitialX(
  ws: AsobiWebSocket,
  playerId: string,
  timeoutMs: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("match.state", handler);
      reject(new Error("timeout waiting for first match.state"));
    }, timeoutMs);
    const handler = (payload: Record<string, unknown>) => {
      const players = (payload.players ?? {}) as Record<string, unknown>;
      const me = players[playerId] as { x?: number } | undefined;
      if (me && typeof me.x === "number") {
        clearTimeout(timer);
        ws.off("match.state", handler);
        resolve(me.x);
      }
    };
    ws.on("match.state", handler);
  });
}

function waitForXAdvanced(
  ws: AsobiWebSocket,
  playerId: string,
  xInitial: number,
  threshold: number,
  timeoutMs: number
): Promise<{ x: number; y: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("match.state", handler);
      reject(
        new Error(
          `timeout waiting for x > ${xInitial + threshold} (initial ${xInitial})`
        )
      );
    }, timeoutMs);
    const handler = (payload: Record<string, unknown>) => {
      const players = (payload.players ?? {}) as Record<string, unknown>;
      const me = players[playerId] as { x?: number; y?: number } | undefined;
      if (me && typeof me.x === "number" && me.x > xInitial + threshold) {
        clearTimeout(timer);
        ws.off("match.state", handler);
        resolve({ x: me.x, y: me.y ?? 0 });
      }
    };
    ws.on("match.state", handler);
  });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      // Any endpoint that doesn't 5xx means the server is up. We use
      // auth/register with an OPTIONS-ish GET — expecting 405 or similar.
      const res = await fetch(`${url}/api/v1/auth/register`);
      if (res.status < 500) return;
    } catch {
      // connection refused, keep polling
    }
    await sleep(1000);
  }
  throw new Error(`sdk_demo_backend never became reachable at ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(...args: unknown[]): void {
  console.error("[smoke]", ...args);
}

main().catch((err) => {
  console.error("[smoke] FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
