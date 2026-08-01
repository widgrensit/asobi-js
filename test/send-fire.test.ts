// Unit tests for sendFire()'s two frame-loop affordances: the `dedupe`
// option and the once-per-connection warning when a send is dropped
// because the socket isn't open yet (or no longer is).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AsobiWebSocket } from "../src/websocket.js";

const OPEN = 1;
const CLOSED = 3;

class FakeWebSocket {
  static OPEN = OPEN;
  static CLOSED = CLOSED;
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
    this.readyState = CLOSED;
    this.onclose?.({ code: 1000 });
  }
}

function lastSocket(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

// Connects and completes the session.connect handshake so the socket is
// open and authenticated, like websocket-auth.test.ts's flow.
async function connectedClient(): Promise<{ ws: AsobiWebSocket; sock: FakeWebSocket }> {
  const ws = new AsobiWebSocket({ url: "ws://x", token: "t" });
  const p = ws.connect();
  const sock = lastSocket();
  sock.onopen?.();
  const connectMsg = sock.sent.map((s) => JSON.parse(s)).find((m) => m.type === "session.connect");
  sock.onmessage?.({
    data: JSON.stringify({ type: "session.connected", cid: connectMsg.cid, payload: {} }),
  });
  await p;
  return { ws, sock };
}

function fireMessages(sock: FakeWebSocket, type: string): Record<string, unknown>[] {
  return sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === type);
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendFire dedupe", () => {
  it("drops a send whose payload structurally equals the last sent payload for that type", async () => {
    const { ws, sock } = await connectedClient();

    ws.sendFire("match.input", { move_x: 1, move_y: 0 }, { dedupe: true });
    ws.sendFire("match.input", { move_x: 1, move_y: 0 }, { dedupe: true });
    ws.sendFire("match.input", { move_x: 1, move_y: 0 }, { dedupe: true });

    expect(fireMessages(sock, "match.input")).toHaveLength(1);
  });

  it("sends again once the payload actually changes", async () => {
    const { ws, sock } = await connectedClient();

    ws.sendFire("match.input", { move_x: 1, move_y: 0 }, { dedupe: true });
    ws.sendFire("match.input", { move_x: 1, move_y: 0 }, { dedupe: true });
    ws.sendFire("match.input", { move_x: 0, move_y: 1 }, { dedupe: true });

    const sentInputs = fireMessages(sock, "match.input").map((m) => m.payload);
    expect(sentInputs).toEqual([
      { move_x: 1, move_y: 0 },
      { move_x: 0, move_y: 1 },
    ]);
  });

  it("compares structurally, not by key order or reference", async () => {
    const { ws, sock } = await connectedClient();

    ws.sendFire("match.input", { x: 1, y: 2 }, { dedupe: true });
    ws.sendFire("match.input", { y: 2, x: 1 }, { dedupe: true });

    expect(fireMessages(sock, "match.input")).toHaveLength(1);
  });

  it("does not dedupe when the option is omitted, matching today's behaviour", async () => {
    const { ws, sock } = await connectedClient();

    ws.sendFire("match.input", { move_x: 1, move_y: 0 });
    ws.sendFire("match.input", { move_x: 1, move_y: 0 });

    expect(fireMessages(sock, "match.input")).toHaveLength(2);
  });

  it("dedupe state is per event type, not global", async () => {
    const { ws, sock } = await connectedClient();

    ws.sendFire("match.input", { x: 1 }, { dedupe: true });
    ws.sendFire("match.other", { x: 1 }, { dedupe: true });

    expect(fireMessages(sock, "match.input")).toHaveLength(1);
    expect(fireMessages(sock, "match.other")).toHaveLength(1);
  });

  it("resets dedupe state on reconnect so the first post-reconnect send always goes out", async () => {
    const { ws, sock } = await connectedClient();
    ws.sendFire("match.input", { x: 1 }, { dedupe: true });
    expect(fireMessages(sock, "match.input")).toHaveLength(1);

    // Explicit close + reconnect (not the internal auto-reconnect timer,
    // which defaults to a 3s interval) - deterministic and instant.
    ws.close();
    const p2 = ws.connect();
    const sock2 = lastSocket();
    expect(sock2).not.toBe(sock);
    sock2.onopen?.();
    const connectMsg = sock2.sent.map((s) => JSON.parse(s)).find((m) => m.type === "session.connect");
    sock2.onmessage?.({
      data: JSON.stringify({ type: "session.connected", cid: connectMsg.cid, payload: {} }),
    });
    await p2;

    ws.sendFire("match.input", { x: 1 }, { dedupe: true });

    expect(fireMessages(sock2, "match.input")).toHaveLength(1);
  });
});

describe("sendFire on a not-open socket", () => {
  it("drops the send and warns once via console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ws = new AsobiWebSocket({ url: "ws://x", token: "t" });

    ws.sendFire("match.input", { x: 1 });
    ws.sendFire("match.input", { x: 2 });
    ws.sendFire("match.input", { x: 3 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("match.input");
  });

  it("does not throw and does not queue the dropped send", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ws = new AsobiWebSocket({ url: "ws://x", token: "t" });

    expect(() => ws.sendFire("match.input", { x: 1 })).not.toThrow();
  });

  it("warns again after a reconnect, since the warning is once per connection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ws } = await connectedClient();

    // Explicit close (sets `closed`, so no auto-reconnect timer fires) +
    // manual reconnect - deterministic and instant.
    ws.close();
    ws.sendFire("match.input", { x: 1 });
    ws.sendFire("match.input", { x: 2 });
    expect(warn).toHaveBeenCalledTimes(1);

    const p2 = ws.connect();
    const sock2 = lastSocket();
    sock2.onopen?.();
    const connectMsg = sock2.sent.map((s) => JSON.parse(s)).find((m) => m.type === "session.connect");
    sock2.onmessage?.({
      data: JSON.stringify({ type: "session.connected", cid: connectMsg.cid, payload: {} }),
    });
    await p2;
    ws.close();

    ws.sendFire("match.input", { x: 3 });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
