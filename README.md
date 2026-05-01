# asobi-js

TypeScript client SDK for the [Asobi](https://github.com/widgrensit/asobi) game backend. Universal — runs in modern browsers and Node 22+.

## Installation

```bash
npm install @widgrensit/asobi
```

> **Node 22+ required.** The SDK uses the global `WebSocket` and global `fetch`, both of which are stable in Node 22 and later. For Node 18 or 20, install [`ws`](https://www.npmjs.com/package/ws) and assign it to `globalThis.WebSocket` before importing.

## Run a backend first

The SDK talks to an Asobi server. The fastest way to get one is the canonical SDK demo backend:

```bash
git clone https://github.com/widgrensit/sdk_demo_backend
cd sdk_demo_backend && docker compose up -d
```

That serves at `http://localhost:8084` (HTTP + WebSocket on `/ws`) with a 2-player `demo` mode. For the full reference game (arena shooter, boons, modifiers, bots) see [`asobi_arena_lua`](https://github.com/widgrensit/asobi_arena_lua).

## Quick Start

```ts
import { Asobi } from "@widgrensit/asobi";

const asobi = new Asobi({ baseUrl: "http://localhost:8084" });

// Register a player (or login if the username already exists).
const { session_token, player_id } = await asobi.auth.register({
  username: "player1",
  password: "secret",
  display_name: "Player One",
});
console.log("registered as", player_id);

const ws = asobi.websocket();
await ws.connect();

// Subscribe BEFORE queueing — the server may push immediately.
// match.matched (matchmaker push) and match.joined (reply to a client-
// initiated match.join) both signal "in a match — match.state will follow."
const off = ws.on("match.matched", (payload) => {
  console.log("matched", payload.match_id);
});
ws.on("match.state", (payload) => {
  console.log("tick", payload.tick, "players", Object.keys(payload.players ?? {}).length);
});

ws.sendFire("matchmaker.add", { mode: "demo" });
```

`ws.on(event, handler)` returns an unsubscribe function — call it to detach the listener.

`sendFire(type, payload)` is fire-and-forget. `send(type, payload)` is RPC-style: it allocates a correlation id and resolves with the matching server reply (10 s timeout).

See the [WebSocket protocol guide](https://github.com/widgrensit/asobi/blob/main/guides/websocket-protocol.md) for the full event surface.

## Features

| Subsystem | REST | WebSocket |
|---|---|---|
| Auth, players, IAP | ✓ | — |
| Matches & matchmaker | ✓ | ✓ |
| Worlds (MMO-scale, terrain) | ✓ | ✓ |
| Chat & direct messages | ✓ | ✓ |
| Social (friends, groups) | ✓ | — |
| Economy (wallets, store, inventory) | ✓ | — |
| Leaderboards & tournaments | ✓ | — |
| Cloud saves & storage | ✓ | — |
| Presence & notifications | ✓ | ✓ |
| Voting | ✓ | ✓ |

The `AsobiWebSocket` class exposes a generic `on(event, cb)` event emitter plus typed `send()` / `sendFire()` helpers. The `"*"` event receives all messages, useful for debugging or a custom dispatcher.

The REST modules under `Asobi` are the v0.x compatibility surface — the long-term direction is protocol-only (everything over `AsobiWebSocket`).

## Browser usage

Anything modern (Chrome / Firefox / Safari / Edge evergreen, iOS Safari ≥15). Bundle with Vite, esbuild, Rollup, or Webpack — the package ships ESM with a `sideEffects: false` hint, so unused subsystems tree-shake out.

## License

Apache-2.0
