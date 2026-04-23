# asobi-js

TypeScript client SDK for the [Asobi](https://github.com/widgrensit/asobi) game backend. Runs in Node.js 18+ and modern browsers.

## Installation

```bash
npm install @asobi/client
```

## Quick Start

```ts
import { Asobi } from "@asobi/client";

const asobi = new Asobi({ baseUrl: "http://localhost:8080" });

// REST APIs
const { access_token } = await asobi.auth.login({ username: "player1", password: "secret" });
asobi.client.setToken(access_token);

const { worlds } = await asobi.worlds.list({ mode: "arena" });
const ticket = await asobi.matchmaker.add({ mode: "arena" });

// Real-time WebSocket
const ws = asobi.websocket();
await ws.connect();

ws.on("match.state", (payload) => console.log("tick", payload.tick));
ws.on("world.tick", (payload) => console.log("world tick", payload));
ws.on("world.terrain", (payload) => console.log("terrain chunk", payload.coords));

ws.sendFire("match.input", { move_x: 1, move_y: 0 });
```

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

## License

Apache 2.0
