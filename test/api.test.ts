import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Asobi } from "../src/index.js";
import type { EntityDelta } from "../src/types.js";

type MockResponse = {
  status: number;
  body: unknown;
};

type Call = {
  url: string;
  method: string;
  body: unknown;
};

let queue: MockResponse[];
let calls: Call[];

function enqueue(status: number, body: unknown): void {
  queue.push({ status, body });
}

function makeResponse({ status, body }: MockResponse): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  queue = [];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const next = queue.shift();
    if (!next) throw new Error(`no queued response for ${init.method} ${url}`);
    return makeResponse(next);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function newSdk() {
  return new Asobi({ baseUrl: "https://api.test", accessToken: "acc" });
}

describe("group endpoints", () => {
  it("updateGroup PUTs a subset body", async () => {
    enqueue(200, { id: "g1", name: "Renamed", open: true });
    const sdk = newSdk();
    const group = await sdk.social.updateGroup("g1", { name: "Renamed", open: true });
    expect(calls[0].url).toBe("https://api.test/api/v1/groups/g1");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toEqual({ name: "Renamed", open: true });
    expect(group.name).toBe("Renamed");
  });

  it("groupMembers GETs the members envelope", async () => {
    enqueue(200, {
      members: [
        { id: "m1", group_id: "g1", player_id: "p1", role: "owner", joined_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const sdk = newSdk();
    const res = await sdk.social.groupMembers("g1");
    expect(calls[0].url).toBe("https://api.test/api/v1/groups/g1/members");
    expect(calls[0].method).toBe("GET");
    expect(res.members).toHaveLength(1);
    expect(res.members[0].role).toBe("owner");
  });

  it("updateGroupMemberRole PUTs role to the member path", async () => {
    enqueue(200, { id: "m1", group_id: "g1", player_id: "p2", role: "admin", joined_at: "2026-01-01T00:00:00Z" });
    const sdk = newSdk();
    const member = await sdk.social.updateGroupMemberRole("g1", "p2", { role: "admin" });
    expect(calls[0].url).toBe("https://api.test/api/v1/groups/g1/members/p2/role");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toEqual({ role: "admin" });
    expect(member.role).toBe("admin");
  });

  it("removeGroupMember DELETEs the member path", async () => {
    enqueue(200, { success: true });
    const sdk = newSdk();
    await sdk.social.removeGroupMember("g1", "p2");
    expect(calls[0].url).toBe("https://api.test/api/v1/groups/g1/members/p2");
    expect(calls[0].method).toBe("DELETE");
  });
});

describe("IAP verification body shapes", () => {
  it("verifyApple posts signed_transaction", async () => {
    enqueue(200, {
      product_id: "coins_100",
      transaction_id: "t1",
      original_transaction_id: "t0",
      purchase_date: "2026-01-01T00:00:00Z",
      expires_date: 0,
      quantity: 1,
      type: "consumable",
      valid: true,
      duplicate: false,
    });
    const sdk = newSdk();
    const res = await sdk.economy.verifyApple({ signed_transaction: "jws.blob.here" });
    expect(calls[0].url).toBe("https://api.test/api/v1/iap/apple");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({ signed_transaction: "jws.blob.here" });
    expect(res.valid).toBe(true);
    expect(res.transaction_id).toBe("t1");
  });

  it("verifyGoogle posts product_id and purchase_token", async () => {
    enqueue(200, {
      product_id: "coins_100",
      order_id: "o1",
      purchase_time: "2026-01-01T00:00:00Z",
      consumption_state: 0,
      acknowledged: true,
      valid: true,
      duplicate: false,
    });
    const sdk = newSdk();
    const res = await sdk.economy.verifyGoogle({ product_id: "coins_100", purchase_token: "tok" });
    expect(calls[0].url).toBe("https://api.test/api/v1/iap/google");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({ product_id: "coins_100", purchase_token: "tok" });
    expect(res.order_id).toBe("o1");
    expect(res.acknowledged).toBe(true);
  });
});

describe("EntityDelta shape", () => {
  // Short op codes, `id` not `entity_id`, and the changed fields merged flat
  // into the same object - see priv/protocol/fixtures/world.tick.json.
  it("matches the backend delta shape", () => {
    const add: EntityDelta = { op: "a", id: "e1", x: 120, y: 80 };
    const update: EntityDelta = { op: "u", id: "e1", x: 2 };
    const remove: EntityDelta = { op: "r", id: "e1" };
    expect(add.op).toBe("a");
    expect(add.id).toBe("e1");
    expect(add.x).toBe(120);
    expect(update.op).toBe("u");
    expect(remove.op).toBe("r");
    expect(remove.x).toBeUndefined();
  });

  it("parses the world.tick fixture", () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, "fixtures", "world.tick.json"), "utf8"),
    ) as { payload: { tick: number; updates: EntityDelta[] } };
    const [delta] = fixture.payload.updates;
    expect(delta.op).toBe("a");
    expect(delta.id).toBe("01j8x000000000000000000000");
    expect(delta.x).toBe(120);
  });
});

describe("list endpoints return the server envelope", () => {
  // Every list endpoint returns {plural: [...]}, not a bare array, and
  // AsobiClient.request returns the parsed body unmodified. These methods
  // were typed Promise<X[]>, so the declared type was a lie and any caller
  // doing .map()/.length on the result threw. Nothing covered the shape.
  it("matches.list", async () => {
    enqueue(200, { matches: [{ id: "m1", mode: "arena", status: "finished" }] });
    const sdk = newSdk();
    const res = await sdk.matches.list();
    expect(res.matches).toHaveLength(1);
    expect(Array.isArray(res)).toBe(false);
  });

  it("economy.wallets / history / store", async () => {
    const sdk = newSdk();
    enqueue(200, { wallets: [{ currency: "gold", balance: 10 }] });
    expect((await sdk.economy.wallets()).wallets).toHaveLength(1);
    enqueue(200, { transactions: [{ id: "t1" }] });
    expect((await sdk.economy.history("gold")).transactions).toHaveLength(1);
    enqueue(200, { listings: [{ id: "l1" }] });
    expect((await sdk.economy.store()).listings).toHaveLength(1);
  });

  it("inventory.list", async () => {
    enqueue(200, { items: [{ id: "i1" }] });
    expect((await newSdk().inventory.list()).items).toHaveLength(1);
  });

  it("social.friends", async () => {
    enqueue(200, { friends: [{ player_id: "p1", status: "accepted" }] });
    expect((await newSdk().social.friends()).friends).toHaveLength(1);
  });

  it("leaderboards.top / around", async () => {
    const sdk = newSdk();
    enqueue(200, { entries: [{ player_id: "p1", score: 5 }] });
    expect((await sdk.leaderboards.top("lb")).entries).toHaveLength(1);
    enqueue(200, { entries: [{ player_id: "p1", score: 5 }] });
    expect((await sdk.leaderboards.around("lb", "p1")).entries).toHaveLength(1);
  });

  it("chat.history", async () => {
    enqueue(200, { messages: [{ id: "c1", sender_id: "p1" }] });
    expect((await newSdk().chat.history("room:lobby")).messages).toHaveLength(1);
  });

  it("notifications.list", async () => {
    enqueue(200, { notifications: [{ id: "n1" }] });
    expect((await newSdk().notifications.list()).notifications).toHaveLength(1);
  });

  it("tournaments.list", async () => {
    enqueue(200, { tournaments: [{ id: "t1" }] });
    expect((await newSdk().tournaments.list()).tournaments).toHaveLength(1);
  });

  it("storage.listSaves / listStorage", async () => {
    const sdk = newSdk();
    enqueue(200, { saves: [{ slot: "1" }] });
    expect((await sdk.storage.listSaves()).saves).toHaveLength(1);
    enqueue(200, { objects: [{ key: "k1" }] });
    expect((await sdk.storage.listStorage("col")).objects).toHaveLength(1);
  });

  it("votes.listByMatch", async () => {
    enqueue(200, { votes: [{ id: "v1" }] });
    expect((await newSdk().votes.listByMatch("m1")).votes).toHaveLength(1);
  });
});

// Request/response shapes the SDK had wrong against the live controllers. Each
// of these was a silent failure: a 500, a dropped filter, or a stored empty map.
describe("wire shapes match the controllers", () => {
  it("purchase posts listing_id", async () => {
    enqueue(200, { success: true, item: { id: "i1" } });
    const sdk = newSdk();
    await sdk.economy.purchase({ listing_id: "l1" });
    expect(calls[0].url).toBe("https://api.test/api/v1/store/purchase");
    expect(calls[0].body).toEqual({ listing_id: "l1" });
  });

  it("consume posts a required quantity", async () => {
    enqueue(200, { success: true });
    const sdk = newSdk();
    await sdk.inventory.consume({ item_id: "i1", quantity: 2 });
    expect(calls[0].body).toEqual({ item_id: "i1", quantity: 2 });
  });

  it("submit carries sub_score", async () => {
    enqueue(200, { leaderboard_id: "lb", player_id: "p1", score: 10, sub_score: 3, rank: 1 });
    const sdk = newSdk();
    await sdk.leaderboards.submit("lb", { score: 10, sub_score: 3 });
    expect(calls[0].body).toEqual({ score: 10, sub_score: 3 });
  });

  // Bare bodies here persisted an empty map: the controllers read `data` and
  // `value` out of the body and default both to #{}.
  it("putSave wraps the blob in `data`", async () => {
    enqueue(200, { slot: "1", data: { level: 5 }, version: 2 });
    const sdk = newSdk();
    await sdk.storage.putSave("1", { level: 5 });
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toEqual({ data: { level: 5 } });
  });

  it("putStorage wraps the object in `value` and sends the perms", async () => {
    enqueue(200, { key: "k1", value: { a: 1 } });
    const sdk = newSdk();
    await sdk.storage.putStorage("col", "k1", { a: 1 }, { read_perm: "public" });
    expect(calls[0].body).toEqual({ value: { a: 1 }, read_perm: "public" });
  });

  it("putStorage sends only the value when no perms are given", async () => {
    enqueue(200, { key: "k1", value: { a: 1 } });
    const sdk = newSdk();
    await sdk.storage.putStorage("col", "k1", { a: 1 });
    expect(calls[0].body).toEqual({ value: { a: 1 } });
  });

  it("matches.live passes the joinable filter and reads match_id", async () => {
    enqueue(200, {
      matches: [
        { match_id: "m1", mode: "demo", status: "waiting", player_count: 1, max_players: 4, joinable: true },
      ],
    });
    const sdk = newSdk();
    const res = await sdk.matches.live({ mode: "demo", joinable: true });
    expect(calls[0].url).toBe("https://api.test/api/v1/matches/live?mode=demo&joinable=true");
    expect(res.matches[0].match_id).toBe("m1");
    expect(res.matches[0].joinable).toBe(true);
  });

  // The status projection names the ticket `id`; only the POST reply and the
  // matchmaker.queued frame carry `ticket_id`.
  it("matchmaker.status reads id, add reads ticket_id", async () => {
    const sdk = newSdk();
    enqueue(200, { ticket_id: "t1", status: "pending" });
    expect((await sdk.matchmaker.add({ mode: "arena" })).ticket_id).toBe("t1");
    enqueue(200, {
      id: "t1",
      mode: "arena",
      status: "pending",
      properties: {},
      submitted_at: 1735689600000,
    });
    const ticket = await sdk.matchmaker.status("t1");
    expect(ticket.id).toBe("t1");
    expect(ticket.submitted_at).toBe(1735689600000);
  });

  // GET /saves projects [slot, version, updated_at] - never the blob.
  it("listSaves returns summaries without the data blob", async () => {
    enqueue(200, { saves: [{ slot: "1", version: 2, updated_at: "2026-01-01T00:00:00Z" }] });
    const res = await newSdk().storage.listSaves();
    expect(res.saves[0].version).toBe(2);
    expect(res.saves[0].data).toBeUndefined();
  });
});

// The route the SDK could not reach until asobi#419: erasing your own account
// without an operator secret. What matters here is not that a POST is sent, but
// that the local token pair survives a refusal and does not survive a success.
describe("erasing your own account", () => {
  it("posts to /players/me/erase and clears the local tokens", async () => {
    enqueue(200, { deleted: true });
    const sdk = newSdk();
    await sdk.players.eraseSelf();
    expect(calls[0].url).toBe("https://api.test/api/v1/players/me/erase");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({});
    expect(sdk.client.getRefreshToken()).toBeUndefined();
  });

  it("sends the password for an account that has one", async () => {
    enqueue(200, { deleted: true });
    const sdk = newSdk();
    await sdk.players.eraseSelf({ password: "secret123" });
    expect(calls[0].body).toEqual({ password: "secret123" });
  });

  // A wrong password leaves a live account. Clearing tokens here would sign the
  // player out of an account that still exists, which is why this is not the
  // `finally` that logout uses. The server answers 403 rather than 401 so this
  // never reaches the refresh-and-replay path either - one request, no rotation,
  // and no replay of a destructive call.
  it("keeps the session when the password is refused", async () => {
    enqueue(403, { error: { code: "player.confirmation_failed", message: "no", details: {} } });
    const sdk = new Asobi({ baseUrl: "https://api.test", accessToken: "acc", refreshToken: "ref" });
    await expect(sdk.players.eraseSelf({ password: "wrong" })).rejects.toThrow();
    expect(sdk.client.getRefreshToken()).toBe("ref");
    expect(calls.length).toBe(1);
  });
});
