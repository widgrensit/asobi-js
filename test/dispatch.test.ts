// Dispatch unit test: feeds every canonical fixture through the SDK's
// WebSocket message handler and asserts the right listener fires.
//
// Pure unit test — no network. Catches doc-vs-server drift bugs (e.g.
// SDK's WsEventType union or docs list an event the server no longer
// emits) before any user reports a silent failure.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AsobiWebSocket } from "../src/websocket.js";

const FIXTURE_DIR = join(__dirname, "fixtures");

// Canonical wire types emitted by the server. Mirrors the asobi protocol
// fixture corpus at asobi/priv/protocol/fixtures/.
const EXPECTED: ReadonlySet<string> = new Set([
  "chat.joined",
  "chat.left",
  "chat.message",
  "dm.message",
  "dm.sent",
  "error",
  "game.error",
  "game.message",
  "match.finished",
  "match.joined",
  "match.left",
  "match.matchmaker_expired",
  "match.state",
  "matchmaker.queued",
  "matchmaker.removed",
  "notification.new",
  "presence.updated",
  "session.connected",
  "session.heartbeat",
  "vote.cast_ok",
  "vote.veto_ok",
  "world.finished",
  "world.joined",
  "world.left",
  "world.list",
  "world.phase_changed",
  "world.terrain",
  "world.tick",
]);

function listFixtureTypes(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function newClient(): AsobiWebSocket {
  return new AsobiWebSocket({ url: "ws://example.invalid", token: "t" });
}

function feed(ws: AsobiWebSocket, raw: string): void {
  // handleMessage is private; reach in for the test. Same pattern the
  // sibling Lua/Defold SDK dispatch tests use.
  (ws as unknown as { handleMessage: (raw: string) => void }).handleMessage(
    raw,
  );
}

describe("protocol dispatch", () => {
  const fixtureTypes = listFixtureTypes();

  it("has fixtures", () => {
    expect(fixtureTypes.length).toBeGreaterThan(0);
  });

  it("every fixture has an EXPECTED entry", () => {
    const missing = fixtureTypes.filter((t) => !EXPECTED.has(t));
    expect(missing, `fixtures with no EXPECTED entry: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("every EXPECTED entry has a fixture", () => {
    const have = new Set(fixtureTypes);
    const missing = [...EXPECTED].filter((t) => !have.has(t));
    expect(missing, `EXPECTED entries with no fixture: ${missing.join(", ")}`)
      .toEqual([]);
  });

  for (const mtype of fixtureTypes) {
    it(`${mtype} -> on("${mtype}") fires`, () => {
      const raw = readFileSync(join(FIXTURE_DIR, `${mtype}.json`), "utf8");
      const ws = newClient();
      let fired = false;
      let received: Record<string, unknown> | null = null;
      ws.on(mtype, (payload) => {
        fired = true;
        received = payload;
      });
      feed(ws, raw);
      expect(fired, `listener for "${mtype}" did not fire`).toBe(true);
      expect(received).not.toBeNull();
    });
  }

  it("WsEventType union covers every fixture (compile check)", () => {
    // If a fixture's wire type is missing from WsEventType, the next
    // line fails to compile. This is the autocomplete guarantee.
    const _typed: import("../src/types.js").WsEventType[] = [
      "chat.joined",
      "chat.left",
      "chat.message",
      "dm.message",
      "dm.sent",
      "error",
      "game.error",
      "game.message",
      "match.finished",
      "match.joined",
      "match.left",
      "match.matchmaker_expired",
      "match.state",
      "matchmaker.queued",
      "matchmaker.removed",
      "notification.new",
      "presence.updated",
      "session.connected",
      "session.heartbeat",
      "vote.cast_ok",
      "vote.veto_ok",
      "world.finished",
      "world.joined",
      "world.left",
      "world.list",
      "world.phase_changed",
      "world.terrain",
      "world.tick",
    ];
    expect(_typed.length).toBe(EXPECTED.size);
  });

  it("game.error carries the typed callback/script/message fields", () => {
    const raw = readFileSync(join(FIXTURE_DIR, "game.error.json"), "utf8");
    const ws = newClient();
    let received: import("../src/types.js").GameErrorPayload | null = null;
    // No cast: the `on("game.error", ...)` overload infers `payload` as
    // GameErrorPayload directly via WsPayloadMap, so a field rename here
    // (e.g. `callback` -> `callbackName`) fails to compile, not just to
    // assert at runtime.
    ws.on("game.error", (payload) => {
      received = payload;
    });
    feed(ws, raw);
    expect(received).toEqual({
      callback: "handle_input",
      script: "match.lua",
      message: "bad arithmetic + on nil, 1",
    });
  });

  it("game.message carries the typed message field (string)", () => {
    const raw = readFileSync(join(FIXTURE_DIR, "game.message.json"), "utf8");
    const ws = newClient();
    let received: import("../src/types.js").GameMessagePayload | null = null;
    // No cast: the `on("game.message", ...)` overload infers `payload` as
    // GameMessagePayload directly via WsPayloadMap.
    ws.on("game.message", (payload) => {
      received = payload;
    });
    feed(ws, raw);
    expect(received).toEqual({ message: "jij bent speler nummer 3" });
  });

  it("game.message does not assume message is a string (number/object)", () => {
    const ws = newClient();
    const received: import("../src/types.js").GameMessagePayload[] = [];
    ws.on("game.message", (payload) => {
      received.push(payload);
    });
    feed(ws, JSON.stringify({ type: "game.message", payload: { message: 3 } }));
    feed(
      ws,
      JSON.stringify({
        type: "game.message",
        payload: { message: { player_number: 3, ready: true } },
      }),
    );
    expect(received).toEqual([
      { message: 3 },
      { message: { player_number: 3, ready: true } },
    ]);
  });
});
