// Smoke test for @asobi/client against the asobi-test-harness.
//
// Expects the harness running at ASOBI_URL (default http://localhost:8080)
// with the `smoke` game mode loaded (see widgrensit/asobi-test-harness).
//
// Exits 0 if the 3 canonical scenarios pass, 1 otherwise.

import { Asobi, AsobiWebSocket } from "../src/index.js";

const BASE_URL = process.env.ASOBI_URL ?? "http://localhost:8080";
const MATCH_MODE = "smoke";
const STARTUP_TIMEOUT_MS = 60_000;
const MATCH_JOIN_TIMEOUT_MS = 10_000;
const STATE_TIMEOUT_MS = 3_000;

async function main() {
  log("Waiting for harness at", BASE_URL);
  await waitForServer(BASE_URL);
  log("Harness reachable.");

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

  // Scenario 3: send one match.input from player A, observe player A's
  // x rise to 1 in a subsequent match.state.
  const statePromise = waitForState(a.ws, a.playerId, STATE_TIMEOUT_MS);
  a.ws.sendFire("match.input", { data: { move_x: 1, move_y: 0 } });

  const myPos = await statePromise;
  if (myPos.x !== 1) {
    throw new Error(`expected x==1 after one input, got ${myPos.x}`);
  }
  log("match.state confirmed: x =", myPos.x);

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

function waitForState(
  ws: AsobiWebSocket,
  playerId: string,
  timeoutMs: number
): Promise<{ x: number; y: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("match.state", handler);
      reject(new Error("timeout waiting for match.state with input applied"));
    }, timeoutMs);
    const handler = (payload: Record<string, unknown>) => {
      const players = (payload.players ?? {}) as Record<string, unknown>;
      const me = players[playerId] as { x?: number; y?: number } | undefined;
      if (me && typeof me.x === "number" && me.x >= 1) {
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
  throw new Error(`harness never became reachable at ${url}`);
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
