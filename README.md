# Ludwig Chess

Standard online chess with a live **Stockfish** evaluation bar on the side, running
entirely in your browser. A strong move tips the bar your way and a blunder makes it
swing, though it never tells you why.

> **Standard online chess. The eval bar shows who is winning. It does not explain
> the move.**

## Architecture

Real-time, two-player, no-login online multiplayer:

- **Server:** Bun + Hono + WebSockets, in-memory and server-authoritative (no DB,
  no login). chess.js is the single rules authority.
- **Frontend:** React 19 + Vite + Tailwind. Renders from the authoritative FEN.
- **Engine:** single-threaded Stockfish-WASM (Stockfish.js, GPLv3) in a Web Worker,
  client-side only. Assets are copied from the npm package at dev/build time (see
  scripts/copy-engine.mjs), not committed.
- **Deploy:** fly.io, a single machine (in-memory state, never scale past one).

Architecture and conventions mirror the round-trip-chess / rps-roulette projects.

## Develop

```
bun install && (cd frontend && bun install)
bun run dev                    # server on :3000
(cd frontend && bun run dev)   # Vite dev server, proxies /ws to :3000
```

## Gates

```
bun run ci         # prettier + eslint + typecheck + bun test + build
bun run gate:e2e   # dual-client headless-Chrome smoke (reserved port 39280)
```

The slice-by-slice build is tracked in [`plans/ludwig-chess-loop.md`](./plans/ludwig-chess-loop.md).
