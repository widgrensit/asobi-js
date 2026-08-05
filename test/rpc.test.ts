// The RPC seam: an extension's method, called over the same socket, correlated
// by cid. Pure unit test - a fake socket, no network.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AsobiWebSocket, AsobiRpcError } from "../src/websocket.js";

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

describe("rpc", () => {
  it("sends rpc.call with the versioned envelope", async () => {
    const { ws, sent } = newClient();
    const pending = ws.rpc("quests.claim", { quest_key: "daily" });

    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe("rpc.call");
    expect(sent[0].payload).toEqual({
      protocol: 1,
      method: "quests.claim",
      params: { quest_key: "daily" },
    });
    expect(sent[0].cid).toBeTruthy();

    feed(ws, {
      type: "rpc.ok",
      cid: sent[0].cid,
      payload: { result: { reward: 100 } },
    });
    await expect(pending).resolves.toEqual({ reward: 100 });
  });

  it("defaults params to an object, so the server never sees a missing key", async () => {
    const { ws, sent } = newClient();
    const pending = ws.rpc("quests.list");
    expect(sent[0].payload.params).toEqual({});
    feed(ws, { type: "rpc.ok", cid: sent[0].cid, payload: { result: {} } });
    await expect(pending).resolves.toEqual({});
  });

  it("rejects rpc.error with the code, not just a message", async () => {
    const { ws, sent } = newClient();
    const pending = ws.rpc("quests.claim", { quest_key: "daily" });

    feed(ws, {
      type: "rpc.error",
      cid: sent[0].cid,
      payload: {
        error: {
          code: "quests.already_claimed",
          message: "This quest's reward has already been claimed.",
          details: { quest_key: "daily" },
        },
      },
    });

    await expect(pending).rejects.toBeInstanceOf(AsobiRpcError);
    await pending.catch((e: AsobiRpcError) => {
      expect(e.code).toBe("quests.already_claimed");
      expect(e.details).toEqual({ quest_key: "daily" });
    });
  });

  it("survives an error object with nothing in it", async () => {
    const { ws, sent } = newClient();
    const pending = ws.rpc("quests.claim");
    feed(ws, { type: "rpc.error", cid: sent[0].cid, payload: {} });
    await pending.catch((e: AsobiRpcError) => {
      expect(e.code).toBe("internal");
      expect(e.details).toEqual({});
    });
  });

  it("correlates concurrent calls by cid", async () => {
    const { ws, sent } = newClient();
    const first = ws.rpc("quests.list");
    const second = ws.rpc("quests.claim", { quest_key: "daily" });
    expect(sent[0].cid).not.toBe(sent[1].cid);

    // Reply out of order: the second call answers first.
    feed(ws, { type: "rpc.ok", cid: sent[1].cid, payload: { result: { ok: 2 } } });
    feed(ws, { type: "rpc.ok", cid: sent[0].cid, payload: { result: { ok: 1 } } });

    await expect(second).resolves.toEqual({ ok: 2 });
    await expect(first).resolves.toEqual({ ok: 1 });
  });

  it("routes the canonical fixtures", async () => {
    const ok = JSON.parse(
      readFileSync(join(FIXTURE_DIR, "rpc.ok.json"), "utf8"),
    );
    const err = JSON.parse(
      readFileSync(join(FIXTURE_DIR, "rpc.error.json"), "utf8"),
    );

    const a = newClient();
    const first = a.ws.rpc("anything");
    feed(a.ws, { ...ok, cid: a.sent[0].cid });
    await expect(first).resolves.toEqual(ok.payload.result);

    const b = newClient();
    const second = b.ws.rpc("anything");
    feed(b.ws, { ...err, cid: b.sent[0].cid });
    await second.catch((e: AsobiRpcError) => {
      expect(e.code).toBe(err.payload.error.code);
    });
  });

  it("times out rather than hanging on a reply that never comes", async () => {
    vi.useFakeTimers();
    try {
      const { ws } = newClient();
      const pending = ws.rpc("quests.claim");
      const assertion = expect(pending).rejects.toThrow(/Timeout/);
      await vi.advanceTimersByTimeAsync(11000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
