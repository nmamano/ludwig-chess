# Ludwig Chess

Standard online chess with a live advantage bar on the side. Today the bar shows
the **material balance**; a full **Stockfish** evaluation that runs entirely in
your browser is the next slice. Once the engine is in, a strong move tips the bar
your way and a blunder makes it swing, though it never tells you why.

> **Standard online chess with a material advantage bar today. A Stockfish-powered
> evaluation is coming next.**

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
