# asobi-js

TypeScript client SDK for the [Asobi](https://github.com/widgrensit/asobi) game backend. Universal — runs in modern browsers and Node 22+.

## Scope

asobi-js is a thin transport client for the asobi protocol. It connects, authenticates, encodes and decodes message frames, manages reconnection and session resume, and dispatches RPC calls and pubsub subscriptions. That's the whole library.

asobi-js does not provide world or match abstractions, voting, terrain, economy, or any other game-shape helper — those are decisions your game makes, not your transport. Phaser, Three.js, and Pixi integrations live as opt-in adapters under [`examples/`](./examples/), not as a bundled API.

Keeping the core small is deliberate: one library, one job, no surprises in your bundle, no opinions about how your game models itself. If you want game-shape primitives, write them on top of asobi-js — they are 50 lines, not a dependency.

## Status

**Pre-1.0.** The current v0.x publishes additional typed REST helpers (matchmaker, leaderboards, economy, social, etc.) inherited from earlier scaffolding. These are scheduled for removal as the SDK narrows to its protocol-only scope. Build new code against the WebSocket transport described below; treat the typed REST modules as deprecated.

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

// Fire-and-forget pubsub publish
ws.send("match.input", { move_x: 1, move_y: 0 });

// RPC: send and await a typed reply
const reply = await ws.send("match.join", { match_id: "abc" });
console.log("joined", reply);

// Disconnect cleanly
ws.close();
```

Topics (`match.state`, `world.entity_added`, etc.) are opaque to this SDK — you publish and subscribe to whatever your server emits. See the [WebSocket protocol guide](https://github.com/widgrensit/asobi/blob/main/guides/websocket-protocol.md) for the full event surface.

## API

```ts
new AsobiWebSocket({ url, token, reconnect?, reconnectInterval?, maxReconnectAttempts?, heartbeatInterval? })

ws.connect(): Promise<Record<string, unknown>>
ws.close(): void
ws.send(type: string, payload?: object): Promise<Record<string, unknown>>  // RPC
ws.on(event: string, handler: (payload) => void): void
ws.off(event: string, handler): void
```

The `"*"` event receives every frame, useful for debugging or building a custom dispatcher.

## Engine and framework adapters

Game-engine and framework integrations live as opt-in examples, not as bundled exports:

- `examples/phaser/` — Phaser 3 helper for driving the SDK from a Scene
- `examples/three/` — Three.js loop integration
- `examples/pixi/` — Pixi.js loop integration

(Examples are added as community contributions land.)

The REST modules under `Asobi` are the v0.x compatibility surface — the long-term direction is protocol-only (everything over `AsobiWebSocket`).

## Browser usage

Anything modern (Chrome / Firefox / Safari / Edge evergreen, iOS Safari ≥15). Bundle with Vite, esbuild, Rollup, or Webpack — the package ships ESM with a `sideEffects: false` hint, so unused subsystems tree-shake out.

## License

Apache-2.0
