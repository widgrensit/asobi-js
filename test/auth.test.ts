import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Asobi } from "../src/index.js";
import { AsobiAuthExpiredError, AsobiError } from "../src/client.js";

type MockResponse = {
  status: number;
  body: unknown;
};

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
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
      headers: (init.headers as Record<string, string>) ?? {},
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

function newSdk(opts: Record<string, unknown> = {}) {
  return new Asobi({ baseUrl: "https://api.test", ...opts });
}

describe("auth token pair", () => {
  it("login parses and stores both tokens", async () => {
    enqueue(200, {
      player_id: "p1",
      access_token: "acc1",
      refresh_token: "ref1",
      username: "alice",
    });
    const sdk = newSdk();
    const res = await sdk.auth.login({ username: "alice", password: "pw" });
    expect(res.access_token).toBe("acc1");
    expect(res.refresh_token).toBe("ref1");
    expect(sdk.client.getAccessToken()).toBe("acc1");
    expect(sdk.client.getRefreshToken()).toBe("ref1");
  });

  it("register stores both tokens", async () => {
    enqueue(200, { player_id: "p1", access_token: "a", refresh_token: "r", username: "u" });
    const sdk = newSdk();
    await sdk.auth.register({ username: "u", password: "pw" });
    expect(sdk.client.getAccessToken()).toBe("a");
    expect(sdk.client.getRefreshToken()).toBe("r");
  });

  it("oauth stores both tokens", async () => {
    enqueue(200, { player_id: "p1", access_token: "a", refresh_token: "r", username: "u" });
    const sdk = newSdk();
    await sdk.auth.oauth({ provider: "google", token: "gtok" });
    expect(sdk.client.getAccessToken()).toBe("a");
    expect(sdk.client.getRefreshToken()).toBe("r");
  });

  it("guest posts device credentials and stores both tokens", async () => {
    enqueue(200, {
      player_id: "p1",
      access_token: "gacc",
      refresh_token: "gref",
      username: "guest-1",
      created: true,
      guest: true,
    });
    const sdk = newSdk();
    const res = await sdk.auth.guest({ device_id: "dev-1", device_secret: "c2VjcmV0LWJhc2U2NA==" });
    expect(calls[0].url).toBe("https://api.test/api/v1/auth/guest");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["Authorization"]).toBeUndefined();
    expect(calls[0].body).toEqual({ device_id: "dev-1", device_secret: "c2VjcmV0LWJhc2U2NA==" });
    expect(res.guest).toBe(true);
    expect(sdk.client.getAccessToken()).toBe("gacc");
    expect(sdk.client.getRefreshToken()).toBe("gref");
  });

  it("upgradeGuest posts credentials with Bearer and replaces both tokens", async () => {
    const sdk = newSdk({ accessToken: "gacc", refreshToken: "gref" });
    enqueue(200, {
      player_id: "p1",
      access_token: "uacc",
      refresh_token: "uref",
      username: "alice",
      upgraded: true,
    });
    const res = await sdk.auth.upgradeGuest({ username: "alice", password: "pw" });
    expect(calls[0].url).toBe("https://api.test/api/v1/auth/guest/upgrade");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["Authorization"]).toBe("Bearer gacc");
    expect(calls[0].body).toEqual({ username: "alice", password: "pw" });
    expect(res.upgraded).toBe(true);
    expect(sdk.client.getAccessToken()).toBe("uacc");
    expect(sdk.client.getRefreshToken()).toBe("uref");
  });

  it("guest surfaces backend errors as AsobiError", async () => {
    enqueue(400, { error: "weak_device_secret" });
    const sdk = newSdk();
    await expect(sdk.auth.guest({ device_id: "dev-1", device_secret: "short" })).rejects.toBeInstanceOf(AsobiError);
    expect(sdk.client.getAccessToken()).toBeUndefined();
  });

  it("invokes onTokens callback for persistence", async () => {
    enqueue(200, { player_id: "p1", access_token: "a", refresh_token: "r", username: "u" });
    const seen: unknown[] = [];
    const sdk = newSdk({ onTokens: (t: unknown) => seen.push(t) });
    await sdk.auth.login({ username: "u", password: "pw" });
    expect(seen).toEqual([{ accessToken: "a", refreshToken: "r" }]);
  });
});

describe("refresh rotation", () => {
  it("refresh() posts refresh_token and rotates both tokens", async () => {
    const sdk = newSdk({ accessToken: "old-acc", refreshToken: "old-ref" });
    enqueue(200, { access_token: "new-acc", refresh_token: "new-ref" });
    const res = await sdk.auth.refresh();
    expect(calls[0].url).toBe("https://api.test/api/v1/auth/refresh");
    expect(calls[0].body).toEqual({ refresh_token: "old-ref" });
    expect(res.access_token).toBe("new-acc");
    expect(sdk.client.getAccessToken()).toBe("new-acc");
    expect(sdk.client.getRefreshToken()).toBe("new-ref");
  });

  it("refresh() throws when no refresh token stored", async () => {
    const sdk = newSdk();
    await expect(sdk.auth.refresh()).rejects.toThrow();
  });
});

describe("401 retry", () => {
  it("refreshes and retries the original request once on 401", async () => {
    const sdk = newSdk({ accessToken: "stale", refreshToken: "ref1" });
    enqueue(401, { error: "invalid_token" });
    enqueue(200, { access_token: "fresh", refresh_token: "ref2" });
    enqueue(200, { id: "p1", username: "alice", display_name: "Alice" });

    const player = await sdk.players.get("p1");
    expect(player).toMatchObject({ id: "p1" });

    expect(calls).toHaveLength(3);
    expect(calls[1].url).toBe("https://api.test/api/v1/auth/refresh");
    expect(calls[1].body).toEqual({ refresh_token: "ref1" });
    expect(calls[2].headers["Authorization"]).toBe("Bearer fresh");
    expect(sdk.client.getRefreshToken()).toBe("ref2");
  });

  it("does not retry auth endpoints on 401", async () => {
    const sdk = newSdk({ refreshToken: "ref1" });
    enqueue(401, { error: "invalid_credentials" });
    await expect(sdk.auth.login({ username: "a", password: "b" })).rejects.toBeInstanceOf(AsobiError);
    expect(calls).toHaveLength(1);
  });

  it("surfaces auth-expired when refresh fails", async () => {
    const sdk = newSdk({ accessToken: "stale", refreshToken: "ref1" });
    enqueue(401, { error: "invalid_token" });
    enqueue(401, { error: "invalid_token" });
    await expect(sdk.players.get("p1")).rejects.toBeInstanceOf(AsobiAuthExpiredError);
    expect(sdk.client.getAccessToken()).toBeUndefined();
    expect(sdk.client.getRefreshToken()).toBeUndefined();
  });

  it("does not attempt refresh with no refresh token", async () => {
    const sdk = newSdk({ accessToken: "stale" });
    enqueue(401, { error: "invalid_token" });
    await expect(sdk.players.get("p1")).rejects.toBeInstanceOf(AsobiError);
    expect(calls).toHaveLength(1);
  });
});

describe("logout", () => {
  it("posts refresh_token with Bearer and clears tokens", async () => {
    const sdk = newSdk({ accessToken: "acc1", refreshToken: "ref1" });
    enqueue(200, { success: true });
    await sdk.auth.logout();
    expect(calls[0].url).toBe("https://api.test/api/v1/auth/logout");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["Authorization"]).toBe("Bearer acc1");
    expect(calls[0].body).toEqual({ refresh_token: "ref1" });
    expect(sdk.client.getAccessToken()).toBeUndefined();
    expect(sdk.client.getRefreshToken()).toBeUndefined();
  });

  it("clears tokens even if the logout request fails", async () => {
    const sdk = newSdk({ accessToken: "acc1", refreshToken: "ref1" });
    enqueue(500, { error: "server_error" });
    await expect(sdk.auth.logout()).rejects.toBeTruthy();
    expect(sdk.client.getAccessToken()).toBeUndefined();
    expect(sdk.client.getRefreshToken()).toBeUndefined();
  });
});
