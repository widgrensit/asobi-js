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

// World input stamped with your own counter: the server acks the highest one
// it consumed, which is what client-side prediction reconciles against.
ws.sendFire("world.input", { move_x: 1 }, { seq: 1 });
ws.on("world.ack", (ack) => console.log("consumed", ack.seq, "at tick", ack.tick));

// RPC: send and await a typed reply
const reply = await ws.send("match.join", { match_id: "abc" });
console.log("joined", reply);

// Into a live match of a mode, spawning one if there is none. Answered with
// match.joined, exactly as match.join is. See "Finding or creating a match".
console.log("joined", await ws.send("match.find_or_create", { mode: "arena" }));

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

### Deleting an account

`eraseSelf()` erases the signed-in player and everything the server holds for them. Irreversible.

```ts
await sdk.players.eraseSelf();                          // guest or provider-only account
await sdk.players.eraseSelf({ password: "s3cret-password" }); // account with a password
```

Pass `password` only for an account that has one — a guest has no credential to re-present, so its session is the confirmation. A wrong password is a `403` (`player.confirmation_failed`) and changes nothing.

On success the SDK clears its tokens, because the server deleted them in the same transaction. Calling anything afterwards on that session is a `401`, which for a retried erase means it already worked.

Requires a server with `POST /api/v1/players/me/erase`. Older deployments answer `404`.

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
ws.sendFire(type: string, payload?: object, options?: { dedupe?: boolean; seq?: number }): void  // fire-and-forget
ws.on(event: string, handler: (payload) => void): void
ws.on("world.ack", handler: (payload: WorldAckPayload) => void)                        // typed via WsPayloadMap
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

### Finding or creating a match

`match.find_or_create` puts you in a live match of a mode, spawning one if
there is none. It is the match twin of `world.find_or_create`, and it is
answered with `match.joined` - the same frame `match.join` is answered with, so
the reply routes identically and the resolved payload is the same shape,
roster included.

```ts
const joined = await ws.send("match.find_or_create", { mode: "arena" });
console.log(joined.match_id, joined.players);
```

The payload takes `mode` only. Every other match parameter comes from the
mode's server-side config.

Prefer it to `match.list` followed by `match.join`. The two-step version races:
two clients reading the same empty listing each create a match. This resolves
server-side and is serialized, so simultaneous callers converge on one match.

Eligibility is the mode's `quick_play` flag, which defaults to `false` for
match modes, so a mode that has not opted in is refused with
`quick_play_disabled`. `listed` is a separate axis - it is browser visibility,
not the opt-in. The other refusals a caller can see are
`match_capacity_reached` (the node-wide cap on live matches), `wrong_mode_type`
(a world mode), and `join_rate_limited` (the same bucket as `match.join` and
`world.join`). Each arrives as an `error` frame, so the `send()` promise
rejects with the reason as its message.

Requires a server on asobi core v0.86.0 or newer.

### Client-side prediction

`world.ack` is the server's input acknowledgement. It is addressed to a single
connection, reaches only a connection that stamped a `seq`, and never rides
the shared `world.tick` broadcast. Stamp each `world.input` with your own
increasing counter through the third argument of `sendFire`, and the server
echoes back the highest counter it has consumed.

`world.tick` is a delta frame, not a snapshot, so prediction needs two pieces:
a local entity map you accumulate from those deltas, and a buffer of inputs
you have predicted but not yet had acked.

```ts
import type { AsobiWebSocket, EntityDelta } from "@widgrensit/asobi";

type Input = { move_x: number; move_y: number };

// Yours to supply: a connected socket, your own entity's id, and your local
// simulation. Your player's entity is keyed by your player id (the
// `player_id` the auth session returned); every other id in a zone is
// whatever the game script assigned it.
declare const ws: AsobiWebSocket;
declare const myEntityId: string;
declare function applyLocally(input: Input): void;
declare function simulate(
  state: Record<string, unknown>,
  input: Input,
): Record<string, unknown>;
declare function render(state: Record<string, unknown>): void;

let seq = 0;
const pending = new Map<number, Input>();

function sendInput(input: Input) {
  seq += 1;
  pending.set(seq, input);
  applyLocally(input);
  ws.sendFire("world.input", input, { seq });
}

// Accumulate the deltas: "a" is a full add, "u" carries changed fields
// only, "r" is a removal. Never assign the frame wholesale as state.
const entities = new Map<string, Record<string, unknown>>();
ws.on("world.tick", (payload) => {
  for (const { op, id, ...fields } of payload.updates as EntityDelta[]) {
    if (op === "r") entities.delete(id);
    else if (op === "a") entities.set(id, fields);
    else entities.set(id, { ...entities.get(id), ...fields });
  }
});

// `ack` infers as WorldAckPayload ({ tick, seq }) - no annotation, no cast.
ws.on("world.ack", (ack) => {
  for (const s of [...pending.keys()]) {
    if (s <= ack.seq) pending.delete(s);
  }
  let state = entities.get(myEntityId);
  if (!state) return;
  for (const input of pending.values()) state = simulate(state, input);
  render(state);
});
```

Prune, then replay: drop every buffered input at or below `ack.seq`, and
re-apply what is left on top of the accumulated state. The rest of the
contract:

- The ack is a high-water mark, not a receipt per input: `seq` is the highest
  input the server has consumed as of world tick `tick`. A rejected input
  still advances it, so a dropped input never strands the client.
- When a tick produced deltas, its `world.tick` goes out first and its
  `world.ack` second. A tick where nothing changed sends no `world.tick` at
  all, so that ack arrives on its own. Reconcile in the ack handler: a client
  that prunes only inside its tick handler misses every ack that comes without
  one.
- Accumulate every op, not just `"u"`. An entity's first delta is an `"a"`,
  including your own player's, so a handler that only merges updates leaves
  the map empty and every ack silently reconciles nothing.
- Snapshots are not once per session, and not once per zone either. A full
  `op:"a"` snapshot of a zone's entities is sent on every new subscription to
  that zone, as a `world.tick` carrying `tick` 0, where "new" means you are
  not already in that zone's subscriber list. Joining subscribes you to your
  whole interest ring, so expect one snapshot per loaded, non-empty zone in
  it - typically several frames, not one.
- A crossing does deliver fresh snapshots. It recomputes the ring, and the
  band of zones that has just entered is subscribed and replays a full
  snapshot each. Only the destination zone is a no-op, because at
  `view_radius` 1 it was already in the old ring and re-subscribing to a zone
  you already hold does nothing; do not generalise that no-op to the rest of
  the crossing. Leaving your ring unsubscribes you and sends `op:"r"` for each
  of that zone's entities, so walking back re-subscribes you and replays
  another full snapshot: a player oscillating across a boundary re-snapshots
  every time. Budget for it, and keep the accumulate-every-op handler above
  correct under repeat adds.
- A zone holding no entities is not silent. It skips the entity snapshot, but
  the terrain push is a separate unconditional step, so a world with a terrain
  provider still delivers that zone's `world.terrain` chunk on subscription.
- Opt-in. You are acked only once the server has consumed an input from you
  carrying a valid `seq`. Subscribe without ever stamping a `seq` and you get
  silence, not an error.
- On the wire `seq` is a top-level sibling of `payload`
  (`{"type":"world.input","seq":412,"payload":{...}}`), never nested inside
  it. `sendFire` stamps it for you, omits it entirely when you pass no `seq`,
  and treats `0` as a value, not an absence.
- The server takes `seq` as an integer in `0 .. Number.MAX_SAFE_INTEGER` (its
  bound is exactly 2^53-1). A value outside that, fractional or negative or
  not a number, is ignored, but the input is not: it is queued and applied to
  the world exactly as normal, and only the acknowledgement is skipped. A
  whole-numbered JS value is safe, since `JSON.stringify` writes `3.0` as `3`,
  but a counter seeded from `performance.now()` goes out as `3.5` and stops
  moving the ack.
- `world.tick` has no `WsPayloadMap` entry, so its payload arrives as
  `Record<string, unknown>` and `updates` needs the cast to the exported
  `EntityDelta[]`. `world.ack` does have one, so `on()` infers
  `WorldAckPayload` (also exported, if you want to name the type) and an ack
  handler needs neither annotation nor cast. `JSON.parse` gives `tick` and
  `seq` as ordinary numbers, so no conversion either.
- `seq` does not defeat `dedupe`: dedupe compares payloads only. A deduped
  send never reaches the wire, so its `seq` is covered by the ack of the next
  send that does.
- Ack cadence follows the world mode's `broadcast_interval` (default `3`). Set
  the interval to `1` for an ack every tick. See the
  [world server guide](https://asobi.dev/docs/world-server).
- Declare the buffered input as a `type`, not an `interface`. `sendFire` takes
  `Record<string, unknown>`, and an interface has no implicit index signature,
  so an `interface Input` fails to compile at the `sendFire` call.

Requires a server on asobi core v0.84.1 or newer. Older servers never send
`world.ack`, so the client sees silence rather than an error. On the client
side, the typed `world.ack` dispatch and the `seq` option shipped in
asobi-js v0.16.0; before that there is no `seq` option to stamp with.

Full frame semantics: [client-side prediction](https://asobi.dev/docs/protocols/websocket#client-side-prediction).

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
