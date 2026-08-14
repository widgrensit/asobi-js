// The `match.find_or_create` send: the match twin of `world.find_or_create`,
// answered with the same `match.joined` frame `match.join` is answered with.
// Pure unit test - a fake socket, no network.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AsobiWebSocket } from "../src/websocket.js";

const FIXTURE_DIR = join(__dirname, "fixtures");

interface Sent {
  type: string;
  cid: string;
  payload: Record<string, unknown>;
}

function newClient(): { ws: AsobiWebSocket; sent: Sent[] } {
  const ws = new AsobiWebSocket({ url: "ws://example.invalid", token: "t" });
  const sent: Sent[] = [];
  // Stand in for the socket: capture what would go out, so the test can reply
  // with the cid the SDK actually chose rather than one it guessed.
  (ws as unknown as { ws: { send: (raw: string) => void } }).ws = {
    send: (raw: string) => sent.push(JSON.parse(raw)),
  };
  return { ws, sent };
}

function feed(ws: AsobiWebSocket, msg: unknown): void {
  (ws as unknown as { handleMessage: (raw: string) => void }).handleMessage(
    JSON.stringify(msg),
  );
}

describe("match.find_or_create", () => {
  it("carries the payload as given, under a cid", async () => {
    const { ws, sent } = newClient();
    const pending = ws.send("match.find_or_create", { mode: "arena" });

    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe("match.find_or_create");
    // A transport: what the caller passed goes out, with nothing added.
    expect(sent[0].payload).toEqual({ mode: "arena" });
    expect(sent[0].cid).toBeTruthy();

    // Settle it, so the reply timer does not outlive the test.
    feed(ws, { type: "match.joined", cid: sent[0].cid, payload: {} });
    await pending;
  });

  it("resolves on match.joined, the frame match.join is answered with", async () => {
    const joined = JSON.parse(
      readFileSync(join(FIXTURE_DIR, "match.joined.json"), "utf8"),
    );
    const { ws, sent } = newClient();
    const pending = ws.send("match.find_or_create", { mode: "demo" });

    feed(ws, { ...joined, cid: sent[0].cid });

    await expect(pending).resolves.toEqual(joined.payload);
  });

  it("routes its reply exactly as match.join's, roster included", async () => {
    const joined = JSON.parse(
      readFileSync(join(FIXTURE_DIR, "match.joined.json"), "utf8"),
    );

    const a = newClient();
    const viaJoin = a.ws.send("match.join", { match_id: joined.payload.match_id });
    feed(a.ws, { ...joined, cid: a.sent[0].cid });

    const b = newClient();
    const viaFind = b.ws.send("match.find_or_create", { mode: joined.payload.mode });
    feed(b.ws, { ...joined, cid: b.sent[0].cid });

    expect(await viaFind).toEqual(await viaJoin);
    expect((await viaFind).players).toEqual(joined.payload.players);
  });

  it("rejects a refusal with its reason", async () => {
    const { ws, sent } = newClient();
    const pending = ws.send("match.find_or_create", { mode: "ranked" });

    // A match mode defaults to quick_play = false, so this is the refusal a
    // caller meets first. The reason is the machine-readable half.
    feed(ws, {
      type: "error",
      cid: sent[0].cid,
      payload: {
        reason: "quick_play_disabled",
        error: {
          code: "ws.request_failed",
          message: "The request failed. See `details.reason`.",
          details: { reason: "quick_play_disabled" },
        },
      },
    });

    await expect(pending).rejects.toThrow("quick_play_disabled");
  });

  // Not exhaustive: the server may add refusals. `not_found` is the one an
  // unknown or unconfigured mode name yields, which a typo reaches first.
  const REFUSALS = [
    "not_found",
    "match_capacity_reached",
    "wrong_mode_type",
    "join_rate_limited",
  ];

  for (const reason of REFUSALS) {
    it(`rejects ${reason} without closing the socket`, async () => {
      const { ws, sent } = newClient();
      let expired = false;
      ws.on("auth_expired", () => {
        expired = true;
      });
      const pending = ws.send("match.find_or_create", { mode: "arena" });

      feed(ws, { type: "error", cid: sent[0].cid, payload: { reason } });

      await expect(pending).rejects.toThrow(reason);
      // None of these is an auth failure: a refused find_or_create leaves the
      // session alone, so the caller can retry or fall back to match.list.
      expect(expired).toBe(false);
    });
  }
});
