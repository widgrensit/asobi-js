// Opt-in guest device-credential helper.
//
// Guest sign-in needs a stable {device_id, device_secret} that the game
// generates once, persists, and re-presents on every launch (the same pair
// resumes the same player). This module does that dance so a game does not
// hand-roll base64 + persistence + the >= 32-byte rule. Entirely optional: pass
// your own values to auth.guest(...) if you want your own storage or key source.
//
// device_id:     any stable, per-install id (here: base64 of 16 random bytes).
// device_secret: standard base64 of 32 random bytes (the server requires this
//                exact shape; anything shorter is rejected as weak_device_secret).

import type { DeviceCredentials, DeviceOptions, DeviceStore } from "./types.js";

const DEFAULT_KEY = "asobi.guest_device";

function base64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  }
  return Buffer.from(bytes).toString("base64");
}

function defaultRandomBytes(n: number): Uint8Array {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("asobi device: no Web Crypto available; pass opts.randomBytes");
  }
  return c.getRandomValues(new Uint8Array(n));
}

let memoryStore: DeviceStore | undefined;

export function createMemoryStore(): DeviceStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

// localStorage in a browser; a process-wide in-memory store elsewhere (Node,
// tests). The in-memory fallback is a singleton so loadOrCreate/clear/loadOrCreate
// stay consistent within a run, but it does NOT survive a restart - pass
// opts.store for real persistence outside the browser.
function resolveStore(opts: DeviceOptions): DeviceStore {
  if (opts.store) {
    return opts.store;
  }
  if (typeof localStorage !== "undefined" && localStorage) {
    return localStorage;
  }
  if (!memoryStore) {
    memoryStore = createMemoryStore();
  }
  return memoryStore;
}

function valid(d: unknown): d is DeviceCredentials {
  return (
    typeof d === "object" &&
    d !== null &&
    typeof (d as DeviceCredentials).device_id === "string" &&
    (d as DeviceCredentials).device_id !== "" &&
    typeof (d as DeviceCredentials).device_secret === "string" &&
    (d as DeviceCredentials).device_secret !== ""
  );
}

// Generate a fresh {device_id, device_secret} pair. opts.randomBytes(n) may
// supply bytes from a stronger source; opts.deviceId fixes the id explicitly.
export function generate(opts: DeviceOptions = {}): DeviceCredentials {
  const rand = opts.randomBytes ?? defaultRandomBytes;
  // Fail loud here rather than as an opaque server `weak_device_secret` 4xx if a
  // custom source under-delivers: the secret must decode to >= 32 bytes.
  const secretBytes = rand(32);
  if (!(secretBytes instanceof Uint8Array) || secretBytes.length < 32) {
    throw new Error("asobi device: randomBytes(32) must return at least 32 bytes");
  }
  let device_id = opts.deviceId;
  if (device_id === undefined) {
    const idBytes = rand(16);
    if (!(idBytes instanceof Uint8Array) || idBytes.length < 16) {
      throw new Error("asobi device: randomBytes(16) must return at least 16 bytes");
    }
    device_id = base64(idBytes.subarray(0, 16));
  }
  const device_secret = base64(secretBytes.subarray(0, 32));
  return { device_id, device_secret };
}

// Load the persisted pair, or generate + persist one on first run. Outside a
// browser (no localStorage) it uses an in-memory store unless opts.store is given.
export function loadOrCreate(opts: DeviceOptions = {}): DeviceCredentials {
  const store = resolveStore(opts);
  const key = opts.key ?? DEFAULT_KEY;
  const raw = store.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (valid(parsed)) {
        return { device_id: parsed.device_id, device_secret: parsed.device_secret };
      }
    } catch {
      // fall through and mint a fresh pair
    }
  }
  const creds = generate(opts);
  store.setItem(key, JSON.stringify(creds));
  return creds;
}

// Erase the stored credentials so the next loadOrCreate / guestDevice mints a
// brand-new guest (data.created = true). Use for "switch account", "play as
// someone else", or a local "forget me" / delete-my-data action. This is
// local-only: it does not delete the server account (pair it with logout to end
// the session, or upgradeGuest first if the player wants to keep it). Pass the
// same key/store opts you signed in with.
export function clear(opts: DeviceOptions = {}): void {
  const store = resolveStore(opts);
  store.removeItem(opts.key ?? DEFAULT_KEY);
}
