# Changelog

## 0.2.0

- **Breaking:** package renamed from `@asobi/client` to `@widgrensit/asobi` for npm publishing.
- **Breaking:** `engines.node` bumped from `>=18.0.0` to `>=22.0.0`. The SDK relies on the global `WebSocket`, which is only stable as a global in Node 22+. Earlier Node versions can polyfill via the `ws` package.
- Added `exports` field, `sideEffects: false`, and full package metadata (`repository`, `homepage`, `bugs`, `keywords`).
- Added `prepare` script so `dist/` is built on install from a git URL.
- README: now points at [`widgrensit/sdk_demo_backend`](https://github.com/widgrensit/sdk_demo_backend) on `:8084` for the quickstart, and documents `match.matched` vs `match.joined` for SDK consumers.

## 0.1.0

- Initial release.
