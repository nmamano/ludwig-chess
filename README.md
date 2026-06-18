# Ludwig Chess

Standard online chess, built to host one twist: a live **evaluation bar** on the
side, powered by a Stockfish engine that runs entirely in your browser. The board,
rules, and multiplayer ship first; the eval bar lands in a later slice (see the
plan linked below). Once it is in, a strong move tips the bar your way and a
blunder makes it swing, though the engine never tells you why.

> **Standard online chess today. The eval bar is the headline feature, coming
> next.**

## Architecture

Real-time, two-player, no-login online multiplayer:

- **Server:** Bun + Hono + WebSockets, in-memory and server-authoritative (no DB,
  no login). chess.js is the single rules authority.
- **Frontend:** React 19 + Vite + Tailwind. Renders from the authoritative FEN.
- **Engine:** single-threaded Stockfish-WASM in a Web Worker, client-side only
  (added in a later slice).
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
