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
