// Unit tests for AsobiWebSocket.onMatchState(): the typed convenience view
// over the otherwise game-defined `match.state` wire payload.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AsobiWebSocket } from "../src/websocket.js";
import type { MatchState } from "../src/types.js";

const FIXTURE = join(__dirname, "fixtures", "match.state.json");

function newClient(): AsobiWebSocket {
  return new AsobiWebSocket({ url: "ws://example.invalid", token: "t" });
}

function feed(ws: AsobiWebSocket, raw: string): void {
  (ws as unknown as { handleMessage: (raw: string) => void }).handleMessage(raw);
}

describe("onMatchState", () => {
  it("derives tick + entities from the canonical fixture's `players` map", () => {
    const raw = readFileSync(FIXTURE, "utf8");
    const ws = newClient();
    let received: MatchState | null = null;
    ws.onMatchState((s) => {
      received = s;
    });
    feed(ws, raw);

    expect(received).not.toBeNull();
    expect(received!.tick).toBe(7);
    expect(received!.entities).toEqual([
      { id: "01j8x000000000000000000000", x: 120, y: 80 },
    ]);
    expect(received!.raw).toEqual({
      tick: 7,
      players: { "01j8x000000000000000000000": { x: 120, y: 80 } },
    });
  });

  it("reads an `entities` map keyed by id when the game uses that convention instead", () => {
    const ws = newClient();
    let received: MatchState | null = null;
    ws.onMatchState((s) => {
      received = s;
    });
    feed(
      ws,
      JSON.stringify({
        type: "match.state",
        payload: { tick: 3, entities: { e1: { hp: 10 }, e2: { hp: 5 } } },
      }),
    );

    expect(received!.tick).toBe(3);
    expect(received!.entities).toEqual(
      expect.arrayContaining([
        { id: "e1", hp: 10 },
        { id: "e2", hp: 5 },
      ]),
    );
    expect(received!.entities).toHaveLength(2);
  });

  it("reads an `entities` array directly when the game already sends one", () => {
    const ws = newClient();
    let received: MatchState | null = null;
    ws.onMatchState((s) => {
      received = s;
    });
    feed(
      ws,
      JSON.stringify({
        type: "match.state",
        payload: { tick: 9, entities: [{ id: "p1", hp: 3 }, { hp: 4 }] },
      }),
    );

    expect(received!.entities).toEqual([
      { id: "p1", hp: 3 },
      // No `id` field in the source item: falls back to its array index.
      { id: "1", hp: 4 },
    ]);
  });

  it("defaults tick to 0 and entities to [] when the payload has neither shape", () => {
    const ws = newClient();
    let received: MatchState | null = null;
    ws.onMatchState((s) => {
      received = s;
    });
    feed(ws, JSON.stringify({ type: "match.state", payload: { phase: "waiting" } }));

    expect(received!.tick).toBe(0);
    expect(received!.entities).toEqual([]);
    expect(received!.raw).toEqual({ phase: "waiting" });
  });

  it("unsubscribes via the returned function like on() does", () => {
    const ws = newClient();
    let calls = 0;
    const unsubscribe = ws.onMatchState(() => {
      calls++;
    });
    const raw = JSON.stringify({ type: "match.state", payload: { tick: 1 } });
    feed(ws, raw);
    unsubscribe();
    feed(ws, raw);

    expect(calls).toBe(1);
  });
});

// Compile-time probes for the `MatchState<T>` escape hatch: `raw` must stay
// typed as `T`, and `entities` must stay `Entity[]` (typed, not `unknown[]`
// or `any[]`) so a regression to either shape fails to compile here rather
// than only at runtime.
{
  const ws = newClient();
  interface MyGameState {
    score: number;
  }
  ws.onMatchState<MyGameState>((s) => {
    expect(typeof s.raw.score).toBe("number");
    // @ts-expect-error `raw` is `MyGameState`, not `unknown`: an unrelated
    // field must not type-check. Catches a regression where `raw` stops
    // being generic over `T`.
    expect(s.raw.notAField).toBeUndefined();
    // `entities` stays typed as `Entity[]`: `.id` is known.
    s.entities[0]?.id.toUpperCase();
  });
}
