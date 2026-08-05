# asobi-js

TypeScript client SDK for the [Asobi](https://github.com/widgrensit/asobi) game backend. Universal — runs in modern browsers and Node 22+.

## Scope

asobi-js is a thin transport client for the asobi protocol. It connects, authenticates, encodes and decodes message frames, manages reconnection and session resume, and dispatches RPC calls and pubsub subscriptions. That's the whole library.

asobi-js does not provide world or match abstractions, voting, terrain, economy, or any other game-shape helper — those are decisions your game makes, not your transport. Engine and framework integrations (Phaser, Three.js, Pixi) are planned as opt-in examples, not a bundled API — see [Engine and framework adapters](#engine-and-framework-adapters).

Keeping the core small is deliberate: one library, one job, no surprises in your bundle, no opinions about how your game models itself. If you want game-shape primitives, write them on top of asobi-js — they are 50 lines, not a dependency.

## Status

**Pre-1.0.** The current v0.x publishes additional typed REST helpers (matchmaker, leaderboards, economy, social, etc.) inherited from earlier scaffolding. These are scheduled for removal as the SDK narrows to its protocol-only scope. Build new code against the WebSocket transport described below; treat the typed REST modules as deprecated.

## Installation

```bash
npm install github:widgrensit/asobi-js
```

> Installs straight from GitHub and builds via the package's `prepare` script.
> Once published, `npm install @widgrensit/asobi` will be the shorter form.

> **Node 22+ required.** The SDK uses the global `WebSocket` and global `fetch`, both of which are stable in Node 22 and later. For Node 18 or 20, install [`ws`](https://www.npmjs.com/package/ws) and assign it to `globalThis.WebSocket` before importing.

## Run a backend first

The SDK talks to an Asobi server. The fastest way to get one is the canonical SDK demo backend:

```bash
git clone https://github.com/widgrensit/sdk_demo_backend
cd sdk_demo_backend && docker compose up -d
```

That serves at `http://localhost:8084` (HTTP + WebSocket on `/ws`) with a 2-player `demo` mode. For the full reference game (arena shooter, boons, modifiers, bots) see [`asobi_arena_lua`](https://github.com/widgrensit/asobi_arena_lua).

## Quick start

```ts
import { AsobiWebSocket } from "@widgrensit/asobi";

const ws = new AsobiWebSocket({
  url: "ws://localhost:8084/ws",
  token: "your-session-token",
});

await ws.connect();

// Subscribe to server-pushed events on any topic
ws.on("match.state", (payload) => {
  console.log("tick", payload.tick);
});

// Typed convenience over the same event: derives `tick`/`entities` on a
// best-effort basis (your game's `get_state` payload has no fixed shape),
// and gives you a generic `raw` escape hatch for the rest.
ws.onMatchState<{ score: number }>((state) => {
  state.entities;    // Entity[] - typed
  state.raw.score;   // your game-specific fields
});

// Fire-and-forget pubsub publish (no reply awaited)
ws.sendFire("match.input", { data: { move_x: 1, move_y: 0 } });

// Driving input from a render loop (e.g. 60fps): `dedupe` skips the send
// when the payload is structurally identical to the last one actually
// sent, so an idle player doesn't flood the socket every frame.
ws.sendFire("match.input", { move_x: 1, move_y: 0 }, { dedupe: true });

// RPC: send and await a typed reply
const reply = await ws.send("match.join", { match_id: "abc" });
console.log("joined", reply);

// Disconnect cleanly
ws.close();
```

Topics (`match.state`, `world.entity_added`, etc.) are opaque to this SDK — you publish and subscribe to whatever your server emits. See the [WebSocket protocol guide](https://github.com/widgrensit/asobi/blob/main/guides/websocket-protocol.md) for the full event surface.

**`sendFire` drops the send and warns if the socket isn't open.** If you call `sendFire` before `connect()` resolves (or after a drop, before it reconnects), the send is silently discarded — same as before — but the SDK now also prints one `console.warn` per connection so this doesn't cost you 20 minutes of "why isn't the server seeing my input." Wire up `await ws.connect()` before you start your render loop, or gate sends on your own "connected" flag, to avoid it entirely.

## Guest / anonymous auth

Let a player start without a signup form. Generate a device secret once (at least 32 CSPRNG bytes, base64-encoded) and persist it on the device; `guest()` creates the account on first call and resumes the same one on every call after.

```ts
import { Asobi } from "@widgrensit/asobi";

const sdk = new Asobi({ baseUrl: "http://localhost:8084" });

// deviceId + deviceSecret are yours to generate and persist per device.
// deviceSecret must be >= 32 random bytes, base64-encoded.
const session = await sdk.auth.guest({ device_id: deviceId, device_secret: deviceSecret });
console.log(session.player_id, session.created); // created:true only on first call

// Later, convert the guest into a full account. Uses the current session.
const upgraded = await sdk.auth.upgradeGuest({ username: "alice", password: "s3cret-password" });
console.log(upgraded.upgraded); // true
```

`guest()` and `upgradeGuest()` store the returned access/refresh tokens exactly like `login()`, so the rest of the SDK is authenticated immediately.

### Guest device (managed keypair)

Don't want to hand-roll the base64 + persistence + `>= 32`-byte rule? `guestDevice()` generates the keypair once, persists it (localStorage in a browser, an in-memory store elsewhere), reuses it on every launch, and signs in — all in one call.

```ts
import { Asobi, device } from "@widgrensit/asobi";

const sdk = new Asobi({ baseUrl: "http://localhost:8084" });

// First call mints + saves the keypair; later calls resume the same guest.
const session = await sdk.auth.guestDevice();
console.log(session.player_id, session.created); // created:true only on first call

// "Forget me" / switch account: erase the stored keypair so the next
// guestDevice() mints a brand-new guest. Local-only — pair with logout().
await sdk.auth.logout();
device.clear();
```

`guestDevice()` is opt-in sugar over `guest()`; the raw `guest(...)` primitive with your own values keeps working. Everything is overridable through an options object, so you can store elsewhere or supply your own bytes:

```ts
await sdk.auth.guestDevice({
  key: "mygame.guest",              // storage key (default "asobi.guest_device")
  store: myKeychainStore,           // any { getItem, setItem, removeItem }
  randomBytes: (n) => myCsprng(n),  // default is Web Crypto getRandomValues
});
```

Outside a browser there is no `localStorage`, so the default store is in-memory and does **not** survive a restart — pass a `store` (file, keychain, DB) for real persistence in Node. The low-level helpers `device.generate()`, `device.loadOrCreate()`, and `device.clear()` are exported too. See [`examples/guest.ts`](examples/guest.ts).

## API

```ts
new AsobiWebSocket({ url, token, reconnect?, reconnectInterval?, maxReconnectAttempts?, heartbeatInterval? })

ws.connect(): Promise<Record<string, unknown>>
ws.close(): void
ws.send(type: string, payload?: object): Promise<Record<string, unknown>>              // request/reply
ws.rpc(method: string, params?: object): Promise<Record<string, unknown>>              // call an extension
ws.sendFire(type: string, payload?: object, options?: { dedupe?: boolean }): void      // fire-and-forget
ws.on(event: string, handler: (payload) => void): void
ws.onMatchState<T>(handler: (state: MatchState<T>) => void): void                      // typed match.state
ws.off(event: string, handler): void
```

The `"*"` event receives every frame, useful for debugging or building a custom dispatcher.

### Calling an extension

An asobi extension declares RPC methods that a client reaches by name:

```ts
try {
  const { reward } = await ws.rpc("quests.claim", { quest_key: "daily_kills" });
} catch (e) {
  if (e instanceof AsobiRpcError && e.code === "quests.already_claimed") {
    // An ordinary outcome, not a failure. Branch on `code`; `message` is
    // prose for a human and may change.
  }
}
```

Replies are correlated by `cid`, so concurrent calls are safe and may answer
out of order. `params` and the returned `result` are always objects, so either
can grow a field without breaking a shipped client.

## Engine and framework adapters

Game-engine and framework integrations are intended as opt-in examples, not
bundled exports. Planned adapters (not yet shipped) include Phaser 3, Three.js,
and Pixi.js loop integrations; they will land under `examples/` as community
contributions arrive. Until then, drive the SDK directly from your render loop -
the API is small enough that no adapter is required.

The REST modules under `Asobi` are the v0.x compatibility surface — the long-term direction is protocol-only (everything over `AsobiWebSocket`).

## Browser usage

Anything modern (Chrome / Firefox / Safari / Edge evergreen, iOS Safari ≥15). Bundle with Vite, esbuild, Rollup, or Webpack — the package ships ESM with a `sideEffects: false` hint, so unused subsystems tree-shake out.

## License

Apache-2.0
