import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Asobi } from "../src/index.js";
import { generate, loadOrCreate, clear, createMemoryStore } from "../src/device.js";
import type { DeviceStore } from "../src/types.js";

// Deterministic byte source: fills 0x00, 0x01, ... so a test can assert an exact
// encoding and length without depending on the CSPRNG.
function rampBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = i % 256;
  return out;
}

const STANDARD_B64 = /^[A-Za-z0-9+/]+={0,2}$/;

describe("device.generate", () => {
  it("produces a standard-base64 secret decoding to exactly 32 bytes", () => {
    const creds = generate({ randomBytes: rampBytes });
    expect(creds.device_secret).toMatch(STANDARD_B64);
    const decoded = Buffer.from(creds.device_secret, "base64");
    expect(decoded.length).toBe(32);
  });

  it("uses the standard '+/' alphabet, not url-safe '-_'", () => {
    // 0xFB,0xFF,... encodes to bytes that force '+' and '/' in standard base64.
    const secret = generate({ randomBytes: (n) => new Uint8Array(n).fill(0xfb) }).device_secret;
    expect(secret).toContain("+");
    expect(secret).toContain("/");
    expect(secret).not.toMatch(/[-_]/);
  });

  it("derives device_id from 16 random bytes by default", () => {
    const creds = generate({ randomBytes: rampBytes });
    expect(creds.device_id).toMatch(STANDARD_B64);
    expect(Buffer.from(creds.device_id, "base64").length).toBe(16);
  });

  it("honours an explicit deviceId", () => {
    const creds = generate({ randomBytes: rampBytes, deviceId: "fixed-id" });
    expect(creds.device_id).toBe("fixed-id");
  });

  it("throws when the byte source under-delivers", () => {
    expect(() => generate({ randomBytes: () => new Uint8Array(16) })).toThrow(/at least 32 bytes/);
  });
});

describe("device.loadOrCreate / clear", () => {
  it("persists on first call and resumes the same pair after", () => {
    const store = createMemoryStore();
    const first = loadOrCreate({ store });
    const second = loadOrCreate({ store });
    expect(second).toEqual(first);
  });

  it("clear erases so the next call mints a fresh pair", () => {
    const store = createMemoryStore();
    const first = loadOrCreate({ store });
    clear({ store });
    const second = loadOrCreate({ store });
    expect(second.device_secret).not.toBe(first.device_secret);
  });

  it("regenerates when the stored value is corrupt", () => {
    const store = createMemoryStore();
    store.setItem("asobi.guest_device", "not json");
    const creds = loadOrCreate({ store });
    expect(creds.device_secret).toMatch(STANDARD_B64);
    expect(store.getItem("asobi.guest_device")).toBe(JSON.stringify(creds));
  });

  it("isolates pairs by key", () => {
    const store = createMemoryStore();
    const a = loadOrCreate({ store, key: "game-a" });
    const b = loadOrCreate({ store, key: "game-b" });
    expect(a.device_secret).not.toBe(b.device_secret);
    expect(loadOrCreate({ store, key: "game-a" })).toEqual(a);
  });
});

type Call = { url: string; method: string; body: unknown };

describe("auth.guestDevice", () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: init.method ?? "GET",
          body: init.body ? JSON.parse(init.body as string) : undefined,
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            player_id: "p1",
            access_token: "gacc",
            refresh_token: "gref",
            username: "guest-1",
            created: true,
            guest: true,
          }),
        } as unknown as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the loaded creds to guest and passes the result through", async () => {
    const store = createMemoryStore();
    const sdk = new Asobi({ baseUrl: "https://api.test" });
    const expected = loadOrCreate({ store });

    const res = await sdk.auth.guestDevice({ store });

    expect(calls[0].url).toBe("https://api.test/api/v1/auth/guest");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({
      device_id: expected.device_id,
      device_secret: expected.device_secret,
    });
    expect(res.player_id).toBe("p1");
    expect(res.created).toBe(true);
    expect(sdk.client.getAccessToken()).toBe("gacc");
    expect(sdk.client.getRefreshToken()).toBe("gref");
  });

  it("resumes the same guest on a second call with the same store", async () => {
    const store: DeviceStore = createMemoryStore();
    const sdk = new Asobi({ baseUrl: "https://api.test" });
    await sdk.auth.guestDevice({ store });
    await sdk.auth.guestDevice({ store });
    expect(calls[1].body).toEqual(calls[0].body);
  });
});
