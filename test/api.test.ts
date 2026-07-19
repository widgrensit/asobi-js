import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  it("matches the backend delta shape", () => {
    const add: EntityDelta = { op: "add", entity_id: "e1", fields: { x: 1 } };
    const update: EntityDelta = { op: "update", entity_id: "e1", fields: { x: 2 } };
    const remove: EntityDelta = { op: "remove", entity_id: "e1" };
    expect(add.op).toBe("add");
    expect(add.entity_id).toBe("e1");
    expect(add.fields).toEqual({ x: 1 });
    expect(update.op).toBe("update");
    expect(remove.op).toBe("remove");
    expect(remove.fields).toBeUndefined();
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
