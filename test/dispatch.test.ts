// Dispatch unit test: feeds every canonical fixture through the SDK's
// WebSocket message handler and asserts the right listener fires.
//
// Pure unit test — no network. Catches doc-vs-server drift bugs (e.g.
// server emits `match.matched` but SDK's WsEventType union or docs only
// mention `matchmaker.matched`) before any user reports a silent failure.

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
  "match.finished",
  "match.joined",
  "match.left",
  "match.matched",
  "match.matchmaker_expired",
  "match.matchmaker_failed",
  "match.state",
  "match.vote_result",
  "match.vote_start",
  "match.vote_tally",
  "match.vote_vetoed",
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
      "match.finished",
      "match.joined",
      "match.left",
      "match.matched",
      "match.matchmaker_expired",
      "match.matchmaker_failed",
      "match.state",
      "match.vote_result",
      "match.vote_start",
      "match.vote_tally",
      "match.vote_vetoed",
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
});
