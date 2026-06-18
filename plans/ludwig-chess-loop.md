# Ludwig chess loop - standing orders + slice handoffs

Re-read this file at the start of every iteration. [why: conversations compact, files do not]

## North star

A standard online 2-player chess game at ludwig.nilmamano.com, same architecture
as round-trip-chess, with a live side eval bar driven by a client-side
single-threaded Stockfish-WASM engine that re-evaluates (1s) after every move,
showing "updating" while it thinks. The bar must never become a second rules
engine: chess.js is the only rules authority; the engine is advisory and cosmetic.

## Process per slice

plan -> Game Reviewer PLAN-GATE (review before implementing) -> implement ->
run gates -> Game Reviewer DIFF-GATE (review the diff before commit) -> sign-off
-> ONE focused commit (tick its checkbox in the same commit).

- Reviewer endpoint: agent-1780864878869-eq7t (Game Reviewer, gpt-5.5).
- Driver endpoint (me): agent-1780859223976-0ki7 (Game Maker).
- Every message to the reviewer MUST instruct it to reply by POSTing back to my
  endpoint. A reply only in its own chat never reaches me. Template:
  curl -s -X POST localhost:4000/agents/agent-1780859223976-0ki7/message \
   -H 'Content-Type: application/json' \
   -d '{"text":"...","senderAgentId":"agent-1780864878869-eq7t"}'
- When waiting on the reviewer, end the turn with a ~20-25 min fallback wakeup.
  The reviewer POST is the real wake signal; the wakeup is only a stall guard.
- Commit only on explicit reviewer sign-off. If the reviewer is unresponsive for
  2 fallback cycles, ping Nil.

## Gates per slice

Always-run (cheap, deterministic, every slice):

- `bun run ci` (root) = prettier --check + eslint + tsc (root + frontend) +
  `bun test tests/` + vite build. Must be green before any commit.

Gated browser smoke (from slice 1b onward; drives real system Chrome):

- `bun run gate:e2e` (to be created in 1a/1b). Builds the frontend, starts ONE
  isolated server on reserved port 39280 (in-memory state, fresh process), drives
  headless system Chrome via playwright-core (channel:'chrome',
  args --no-sandbox --disable-dev-shm-usage --disable-gpu).
- Judge via the evidence surface, never the DOM/pixels:
  - server RoomSnapshot (authoritative fen / turn / result), and
  - client `window.__ludwig` ({ fen, turn, result }) and
    `window.__ludwigEval` ({ whiteCp, mate, depth, updating, fen }).
- 1a check: two clients connect, moves reflected (compare `window.__ludwig.fen` to
  server truth), scripted checkmate yields gameOver=win in the snapshot, illegal
  move rejected.
- 1c check: blunder a queen, poll `window.__ludwigEval`; assert white-relative cp
  drops past a threshold, and "updating" appears then clears.
- Screenshots are evidence artifacts only, never assertions.

No quota/money/env-gated gates exist: the engine is local WASM and free. If any
paid layer is ever added, it must hard-refuse without an explicit env opt-in and
document the burn in its header.

Reserved ports: 39271 stockfish probe (done); 39280 e2e app-under-test. Dev
default is 3000 via PORT env. Never reuse or clobber a live/dev instance.

## Standing rails (prohibitions, verbatim)

1. NEVER modify, stage, commit, push, deploy, or otherwise touch round-trip-chess
   (repo at ~/nil/round-trip-chess), its fly app, or chess.nilmamano.com. Also do
   not modify the read-only references ~/nil/rps-roulette and ~/nil/wallgame.
   Ludwig is a fully separate repo + fly app + domain.
2. NEVER create the GitHub repo, create the fly app, push to any remote, or run a
   production deploy or DNS change unless it is explicitly pre-authorized by Nil
   (it runs as Nil's credentials). Nil pre-authorized create/push/deploy for
   ludwig-chess on 2026-06-18. The DNS record at the nilmamano.com provider is the
   one parked-for-Nil step if I cannot service it myself.
3. Keep EXACTLY ONE fly machine (state is in-memory). Never scale past 1.
4. The engine stays frontend-only (client-side WASM). Never move eval to the server.
5. Budget is 0 dollars. No paid services or APIs.
6. Never weaken, skip, or comment-out a gate to make it pass. Fix it in-slice or
   queue it as a parked decision. A bug a gate finds gets a regression test at the
   right layer in the same slice.
7. No em dashes and no en dashes anywhere in code, copy, or comments (Nil house rule).
8. One slice at a time. Never start slice N+1 before slice N is committed. One
   focused commit per slice.
9. Only stage my own changes. If a file has unrelated uncommitted changes, stop
   and flag rather than touching it.
10. Do not relitigate a slice's Locked list.

## Decision protocol

- Assistant-alone: code/test structure, eval-to-bar mapping math, component
  layout, file organization, naming, chess.js / stockfish build choice, gate
  script design.
- Decide-with-reviewer (Game Reviewer, via plan-gate + diff-gate): protocol/state
  contract changes, engine integration approach, gate adequacy.
- HUMAN-ONLY (Nil), queue as parked-for-Nil, never decided in the loop: making
  the repo public, the actual DNS record if not self-serviceable, any spend, any
  relaxation of a rail.
- If hard-blocked on a human-only item: queue it, work what is unblocked. If fully
  blocked: stop the loop cleanly and leave a summary.

## Stop conditions

- All non-optional slices (1a-1d) shipped and committed -> stop, no further
  wakeups, update this file with a completion note, leave Nil a summary table
  (slice -> commit -> what landed) plus the parked queue and the live URL.
- 3 consecutive gate failures on one slice with no path forward -> stop + summarize.
- 5 non-converging reviewer rounds on one slice -> escalate to Nil.
- Fully blocked on a parked-for-Nil item with nothing unblocked -> stop + summarize.
- Reviewer unresponsive for 2 fallback cycles -> ping Nil.

## Slice plan

- [x] 1a Fork to standard chess (chess.js source of truth, single board, full
      rules + all draws, online 2-player, rebrand). baseline 51334dd
- [x] 1b Static eval-bar UI (side panel, dummy value, layout + mobile). baseline 266d079
- [x] 1c Stockfish-WASM integration (worker, 1s/move, updating state, live
      refine, white-relative cp, mate display, evidence surface). baseline 43c00c3
- [ ] 1d Deploy to ludwig.nilmamano.com (new GitHub repo, fly app, custom
      domain, OG tags)
- [ ] OPT numeric/mate edge polish
- [ ] OPT eval history sparkline
- [ ] OPT multi-threaded engine upgrade (needs COOP/COEP headers)
- [ ] OPT mobile layout polish

## Deferred / parked

- parked-for-Nil: approve the about $2/month fly machine for ludwig-chess (or confirm
  a legacy free allowance) before any `fly apps create` / `fly deploy`. Reconciles
  standing rail 5 ($0); the deploy is the one approved exception, pending Nil.
- parked-for-Nil: flip the GitHub repo to public (default is private).
- parked-for-Nil: add the EXACT fly-provided DNS records for ludwig.nilmamano.com
  (captured from `fly certs add`, not inferred from chess.nilmamano.com) at the
  nilmamano.com DNS provider (slice 1d; I lack provider access).
- note: stockfish.js is GPLv3, loaded as a separate UCI worker (not statically
  linked). Add a visible credits/source link in the UI. Flag to Nil if the repo
  license needs to be reconciled.
- do-not-pick-up: any round-trip variant feature (second board, placement, chains,
  king-capture win). They are gone by design.

## Resources

- Repo: /home/nil/nil/ludwig-chess (branch master, trunk-based, no remote yet).
  Baseline import: 51334dd.
- Read-only references: ~/nil/round-trip-chess, ~/nil/rps-roulette, ~/nil/wallgame.
  Deploy playbook to mirror: round-trip-chess/HANDOFF-DEPLOY.md.
- Stack: Bun 1.3.11 + Hono + WebSockets server; React 19 + Vite 6 + Tailwind v4
  frontend; in-memory server-authoritative state; fly.io single machine; node
  v24.14.0.
- Rules library: chess.js (to add). legal moves, fen(), turn(), move() (throws on
  illegal), moves({square,verbose}), board(), isCheckmate/isStalemate/
  isThreefoldRepetition/isInsufficientMaterial/isDraw/isGameOver. Browser-safe,
  zero deps. Use on BOTH server (authority) and client (render + hints + fen).
- Engine: npm `stockfish` 18.0.8, flavor stockfish-18-lite-single (.js + .wasm,
  approx 7MB, single-threaded, no COOP/COEP, GPLv3). Loaded as a Web Worker; UCI
  over postMessage; `go movetime 1000`.
- Verified tooling (Phase 2, 2026-06-18): baseline `bun run ci` green, 111 tests.
  System Chrome 145.0.7632.159 at /usr/bin/google-chrome. playwright-core 1.61.0,
  channel:'chrome', args --no-sandbox --disable-dev-shm-usage --disable-gpu. gh
  authed as nmamano (scopes repo, workflow). fly authed (~/.fly/bin/fly). Stockfish
  probe PASS: start cp+40, white-up-queen cp+671, approx 1s each, evidence surface
  readable (`window.__results`).
- Evidence surfaces (the oracle): server RoomSnapshot; client `window.__ludwig` and
  `window.__ludwigEval`. Never assert on DOM pixels.
- House patterns: server reads PORT env; serves built SPA from frontend/dist plus
  /ws and /health; OG/Twitter absolute URLs in frontend/index.html must match the
  deploy origin (update in slice 1d). No em dashes.
- Endpoints: driver agent-1780859223976-0ki7; Game Reviewer agent-1780864878869-eq7t;
  task/agent API localhost:4000.

## Load-bearing traps (read before any engine or protocol work)

- UCI `score cp` and `score mate` are from the SIDE-TO-MOVE perspective. The eval
  bar is White-relative: negate when black is to move. `score mate N` pins the bar
  to the mating side (after the perspective flip); display M{abs(N)}.
- Server is the authority. A client move is a request: server validates with
  chess.js and broadcasts the new fen. The client never trusts its own optimistic
  legality.
- The Stockfish worker swallows commands sent before it is ready: wait for uciok
  then readyok before `go`. Always send ucinewgame and position fen before go.
- Serve the .wasm as application/wasm (or accept the streaming fallback). The
  worker resolves the wasm relative to the worker script URL: keep .js and .wasm
  same origin and directory.
- Each client runs its OWN engine. Evals are advisory and may differ slightly
  between clients. Do not sync eval through the server.

## SLICE-1a PICKUP (authored now)

- Baseline: 51334dd (master).
- Goal: online 2-player STANDARD chess with chess.js as the single source of truth
  on server (authoritative) and client (render + legality hints + fen). Single
  board. Full rules including all draws and game-over (checkmate, stalemate,
  threefold, 50-move, insufficient material). Rebrand to "Ludwig chess" (standard
  chess). NO eval bar yet. Demoable end-to-end: two browsers play a real game to
  checkmate or draw, online.
- Load-bearing mechanics / traps:
  - Replace the variant engine wholesale; chess.js is the source of truth.
    Recommended model: the Match holds a Chess instance; RoomSnapshot carries
    { fen, turn, lastMove?, check, result? } plus the room fields (code, lobby,
    players). Drop boards:[Board,Board], kingCaptures, placement phase, {t:"place"}.
  - Protocol move: switch to algebraic squares to align with chess.js, e.g.
    { t:"move", from:"e2", to:"e4", promotion?:"q" }. Drop board. Update
    ClientMsg/ServerMsg/ErrorCode (drop illegal_placement; keep illegal_move).
  - Server flow unchanged in shape: socket dispatch -> rooms.move -> match.move;
    inside match.move validate via chess.js .move() (throws on illegal), enforce
    turn via .turn() vs the player color, then broadcast snapshot. Map chess.js
    game-over to Outcome: checkmate -> win(winner); stalemate/threefold/50-move/
    insufficient -> draw(reason).
  - Frontend: render a single board from chess.js .board() (reconstruct
    new Chess(fen) from the snapshot). Click-to-move with hints from
    .moves({square,verbose:true}). Keep the promotion picker, wired to chess.js
    promotion. Expose `window.__ludwig` = { fen, turn, result } for gates.
  - Rebrand: package.json names, SESSION_KEY, header + lobby logos and taglines,
    RulesPanel (standard rules), remove placement/chain/king-capture copy, board
    labels, index.html title/description (OG absolute URLs deferred to 1d). No em
    dashes.
  - Tests: rewrite tests/ for standard chess via the chess.js-backed match: legal
    accepted, illegal rejected, turn enforced, checkmate->win, stalemate->draw,
    threefold/50-move/insufficient->draw, promotion, castling, en passant. Keep the
    rooms/reconnect tests (room layer is unchanged).
- Acceptance criteria:
  - `bun run ci` green; no variant references remain (grep clean for round-trip,
    two-board, placement, kingCapture).
  - e2e gate on port 39280: two clients connect, moves reflected (`window.__ludwig.fen`
    vs server truth), a scripted checkmate yields gameOver=win in the snapshot, an
    illegal move is rejected. Assertions on the evidence surface, not pixels.
- Decide-with-reviewer: the new fen-based RoomSnapshot/protocol shape; algebraic vs
  numeric squares; how much of shared/ to delete vs keep; e2e gate adequacy for 1a.
- Locked (do not relitigate): chess.js is the rules authority; standard chess only;
  single board; full rules including all draws; online 2-player server-authoritative;
  engine work deferred to 1c.
- Resources: the architecture map in this repo's planning context; chess.js docs;
  round-trip files to adapt: server/socket.ts, server/rooms.ts, server/match.ts,
  shared/protocol.ts, shared/board.ts, frontend App.tsx, Game.tsx, Board.tsx,
  Lobby.tsx, RulesPanel.tsx, tests/\*.

## SLICE-1b PICKUP

- Baseline: 266d079 (slice 1a committed; `bun run ci` 35 tests + `bun run gate:e2e`
  14 checks both green at baseline).
- What 1a taught (fold in):
  - chess.js 1.4.0 API: `new Chess(fen)`; `.board()` rows run rank 8 down to rank 1,
    cells are { square, type, color:'w'|'b' } or null; `.get(sq)` is { type, color }
    or false; `.turn()` is 'w'|'b'; `.fen()`; `.inCheck()`; draw predicates
    isStalemate/isThreefoldRepetition/isDrawByFiftyMoves/isInsufficientMaterial.
  - The frontend already reconstructs `new Chess(snapshot.fen)` in
    frontend/src/lib/chess.ts (piecesFromFen etc.); reuse it to compute a dummy
    material eval from the FEN. white/black conversion is centralized in
    shared/chess.ts (toColor); do not add a second converter.
  - Debug seams exist: `window.__ludwig` (snapshot mirror), `window.__ludwigError`,
    `window.__ludwigMove`; `window.__ludwigEval` is declared in
    frontend/src/lib/debug.ts but not yet populated. 1b populates it.
  - The eval bar mounts in Game.tsx beside the board: today the board sits in
    `<div className="flex justify-center"><div className="w-full max-w-[520px]">Board</div></div>`.
    Add the bar as a flex sibling of that inner box.
  - The dual-client gate pattern works (channel chrome, --no-sandbox, assert on
    `window.__ludwig`); extend it for 1b. Reserved e2e port stays 39280.
  - Prettier mangles `__name__` in markdown: always backtick debug identifiers here.
  - bun.lock workspace name does not auto-update on rename: edit the name field
    directly if a future rename is needed.
  - Reviewer rules to honor: do not advertise absent features (1b SHIPS the bar, so
    eval-bar copy may return now); judge via the evidence surface, not pixels;
    centralize conversions; unit-test the mapping with exact expected values.
- Goal: a static eval bar beside the board, wired to a DUMMY eval (white-relative
  material count derived from the FEN), with a numeric label. No Stockfish yet (1c
  swaps the eval SOURCE only). Demoable: capture material, the bar and number shift.
  Mobile layout stays usable (the bar is a thin vertical strip).
- Load-bearing mechanics / traps:
  - Pure mapping module frontend/src/lib/evalbar.ts: `evalToBar({ whiteCp?, mate? })`
    returns { fillPct (white's share, 0..100), label, clampedCp }. Use a logistic
    map winProb = 1 / (1 + 10^(-cp/400)) so the bar is smooth and saturates; clamp
    fillPct to roughly [2, 98] so a side is never fully erased. mate>0 (white mates)
    pins near 99, mate<0 near 1. Label: cp -> signed (cp/100).toFixed(1) e.g. "+1.3"
    / "0.0" / "-0.5"; mate -> "M" + abs(n). UNIT TEST exact values + monotonicity +
    clamping + mate + the 0 -> "0.0" / 50% case.
  - Dummy eval source: white-relative material centipawns from the FEN
    (P=100,N=320,B=330,R=500,Q=900, K excluded), computed via chess.js board().
    Keep this in its own function (materialEvalCp(fen)) so 1c can replace the source
    without touching the bar or the mapping.
  - EvalBar component (frontend/src/components/EvalBar.tsx): a thin vertical bar; the
    white share fills from the viewer's own side (orientation-aware: white at the
    bottom when myColor is white, at the top when myColor is black). Show the numeric
    label. Include an "updating" visual state driven by a prop (it will not trigger
    in 1b since the dummy is synchronous; 1c drives it). Expose nothing new in the
    DOM that the gate must trust; the gate reads the evidence surface.
  - Evidence surface: populate `window.__ludwigEval` =
    { source:'material', whiteCp, mate:null, fillPct, label } from the authoritative
    snapshot (in App.tsx, alongside publishDebug, or a publishEval helper in debug.ts).
    The gate asserts on this, not on bar pixels.
  - Copy: the eval bar now exists, so re-introduce honest eval-bar copy where it
    helps (Lobby tagline, RulesPanel, index.html/README) describing what the bar
    does. Keep it truthful to the dummy-vs-engine distinction only if it would
    mislead (a material bar still "shows who is winning"); engine specifics wait
    for 1c. No em dashes.
- Acceptance criteria:
  - `bun run ci` green; new unit tests for evalbar mapping (exact values) and
    materialEvalCp (start = 0; up a queen approx +900).
  - `bun run gate:e2e`: extend with eval-bar checks judged on the evidence surface:
    the bar element renders; `window.__ludwigEval` is populated with a numeric
    whiteCp and fillPct in [0,100]; after a capturing line that wins material, the
    whiteCp and fillPct move in the correct direction.
- Decide-with-reviewer: the logistic constant / clamp bounds; bar orientation
  (flip-with-board vs always-white-at-bottom); dummy = material vs flat 0.0; the
  shape of `window.__ludwigEval`; the 1b gate additions.
- Locked (do not relitigate): chess.js stays the rules authority; the engine is
  frontend-only and arrives in 1c (1b changes only the eval SOURCE seam); judge via
  evidence surface; single fly machine; no em dashes.
- Resources: frontend/src/lib/chess.ts (FEN reconstruction), Game.tsx (board
  mount point), debug.ts (`window.__ludwigEval` declaration), tests/e2e/gate.mjs
  (extend), styles.css tokens.

## SLICE-1c PICKUP

- Baseline: 43c00c3 (slice 1b committed; `bun run ci` 49 tests + `bun run gate:e2e`
  20 checks both green).
- What 1b taught (fold in):
  - App is the SINGLE eval producer: it derives one `LudwigEvalDebug` and both
    publishes it (publishEval) and passes it to Game as `evalState`. Game and
    EvalBar only render it. So 1c changes ONLY App's producer block: replace the
    material `useMemo` with engine-driven `useState` + an effect. Do not touch
    EvalBar, Game, debug.ts, or the gate's shape/correlation assertions beyond
    swapping source-specific expectations.
  - The contract is `LudwigEvalDebug { source, fen, whiteCp, mate, depth, updating,
fillPct, label }`. 1c sets source='stockfish', makes depth and updating live,
    and uses mate when the engine reports it. `fen` still correlates the eval to
    the authoritative position; App must IGNORE engine results whose fen != the
    current snapshot.fen (stale-eval guard).
  - `evalToBar` already takes a discriminated input ({kind:'cp'|'mate'}); feed it
    {kind:'mate',mate} for mate scores, {kind:'cp',whiteCp} otherwise.
  - Phase 2 proved the engine: npm `stockfish` 18.0.8, flavor
    stockfish-18-lite-single (.js + .wasm, approx 7MB, single-threaded, no
    COOP/COEP). Worker protocol: postMessage UCI strings, onmessage UCI lines;
    wait for `uciok` then `readyok` before `go`; `position fen <fen>` then
    `go movetime 1000`; parse `info ... score cp|mate N` and `bestmove`. The
    /tmp probe harness is the template.
  - material.ts and its tests stay (proven utility) but App stops importing it; the
    bar shows `updating` until the engine's first result rather than falling back
    to material (keep ONE source).
- Goal: replace the dummy material source with a real client-side single-threaded
  Stockfish-WASM engine. After every move, each client's engine evaluates the new
  position at `go movetime 1000`, the bar shows `updating` while it thinks and
  refines live as depth grows, and the white-relative cp/mate drives the bar and
  `window.__ludwigEval`. Demoable: blunder a queen and watch the bar crater; the
  drop is read from the engine's own cp on the evidence surface, not pixels.
- Load-bearing mechanics / traps:
  - UCI `score cp`/`score mate` is from the SIDE-TO-MOVE perspective. Convert to
    white-relative: negate when the fen's side to move is black. Mate likewise.
    Unit-test this conversion (pure function) plus the info-line parser.
  - Engine module frontend/src/lib/engine.ts wraps the Worker. API shape:
    analyze(fen) supersedes any running analysis and emits onEval({ fen, whiteCp,
    mate, depth, updating }) on info lines and on bestmove (updating=false). EVERY
    emit carries the fen it was computed for so App can drop stale results. New
    position while analyzing: send `stop`, then `position fen`+`go` (serialize, or
    tag by fen and ignore stale). Wait for uciok/readyok before the first go.
  - Engine file delivery: copy stockfish-18-lite-single.{js,wasm} from
    node_modules/stockfish/bin into frontend/public/engine/ via a small build step
    (gitignore frontend/public/engine so the 7MB wasm is not committed; vite copies
    public/ into dist/). `new Worker('/engine/stockfish-18-lite-single.js')`; the
    worker resolves the .wasm relative to its own URL (same dir). Add `stockfish`
    to frontend deps.
  - Lazy-load the engine once the game is active (avoid 7MB on the lobby). One
    engine instance per app lifetime; terminate on unmount.
  - Terminal positions (snapshot.result != null) and the waiting snapshot: do NOT
    call the engine (a mated position yields `bestmove (none)`); short-circuit to a
    sensible eval (win -> pin to the winner via a mate-style value; draw -> even),
    updating=false.
  - On a new move: set updating=true immediately (keep the last fillPct so the bar
    does not jump to 50), then let the engine refine.
  - Each client runs its OWN engine: evals are advisory and may differ slightly at
    the 1s cutoff. Do NOT assert cross-client EXACT equality for engine evals
    (unlike the deterministic material eval); assert shape, direction, and rough
    agreement only.
- Acceptance criteria:
  - `bun run ci` green; new unit tests for the white-relative conversion and the
    info-line parser (pure functions extracted from the engine module).
  - `bun run gate:e2e` green with the real engine: after connect, source becomes
    'stockfish', depth becomes a finite number, updating transitions true then
    false, start-position whiteCp is small (roughly [-150,150]). A scripted BLUNDER
    (e.g. hang the queen) makes the blundering side's white-relative cp move sharply
    in the opponent's favor, read from `window.__ludwigEval.whiteCp` (the engine's
    own output), past a safe threshold (e.g. >= 300 cp swing). Generous timeouts for
    engine load (7MB) and the 1s think.
- Decide-with-reviewer: engine file delivery (copy-at-build + gitignore vs commit);
  the supersede/stale-fen approach; terminal-position short-circuit; the exact
  blunder line and cp-swing threshold; dropping cross-client exact-equality for
  engine evals; updating-transition assertion method; movetime 1000 (locked by Nil).
- Locked (do not relitigate): the engine is frontend-only, single-threaded
  lite-single, no COOP/COEP; 1s think; only App's producer changes; judge via the
  engine's own cp on the evidence surface, never pixels; single fly machine; no em
  dashes; $0 budget (local wasm, free).
- Resources: the Phase 2 probe (/tmp/sf-probe template), frontend/src/lib/debug.ts
  (contract), frontend/src/lib/evalbar.ts (mapping), App.tsx (the only producer to
  change), tests/e2e/gate.mjs (extend), node_modules/stockfish/bin (engine files).

## SLICE-1d PICKUP

- Baseline: b11187d (slices 1a/1b/1c committed; `bun run ci` 67 tests +
  `bun run gate:e2e` 17 real-engine checks both green).
- What 1c taught (fold in):
  - The engine ships via the build: frontend `build` runs `bun ../scripts/copy-engine.mjs`
    (bun, not node, so it works in the oven/bun Docker image) then vite, which copies
    frontend/public/engine into dist/engine. The Dockerfile's
    `find . ! -regex '^./dist...' -delete` keeps dist/engine. So the wasm is in the
    image even though it is gitignored in the repo.
  - The e2e gate already serves the production build through the REAL server
    (server/index.ts serveStatic) and the engine loads, so engine-from-server is
    proven; the live smoke confirms it over the network.
- Goal: deploy Ludwig chess to a public URL. New PRIVATE GitHub repo
  nmamano/ludwig-chess, new fly app ludwig-chess (slug already set in fly.toml +
  fly-deploy.yml), single machine, then the custom domain ludwig.nilmamano.com.
  Demoable: open the live URL on two devices, play a game, watch the Stockfish eval
  bar update and swing on a blunder.
- BILLING GUARD (blocks the credentialed phase): a kept-running shared-cpu-1x 256mb
  fly machine is about $2/month, NOT $0 (free allowances are legacy-org only, and
  min_machines_running=1 means it does not auto-stop to free). The fly org is
  personal (Nil M) and already runs 4 such apps. Do NOT run `fly apps create` /
  `fly deploy` until Nil EXPLICITLY approves the about $2/month or confirms a legacy
  allowance. This reconciles standing rail 5 ($0): the deploy is the one approved
  exception, pending Nil.
- Reviewed decisions (the credentialed-phase handoff; do not relitigate):
  - OG art is REGENERATED and was BLOCKING: scripts/make-og.mjs produced a
    Ludwig-branded 2400x1260 frontend/public/og.png (committed). Favicons are
    icon-only king art, kept as-is. OG/Twitter absolute URLs are finalized to
    https://ludwig.nilmamano.com in index.html.
  - Local pre-deploy gate: docker DAEMON IS UNAVAILABLE here (user not in the docker
    group; sudo needs a password). `bun run gate:prod` is the accepted local
    substitute (clean-state rebuild proving copy-engine regenerates dist/engine from
    deps, then production `bun run start` serving the assets 200 + nonzero +
    application/wasm + /health). `bun run gate:docker` remains for docker-capable
    environments. The fly --remote-only build (same Dockerfile) plus the live smoke
    are STILL REQUIRED before the deploy is considered complete.
  - server/index.ts serves /engine/\*.wasm as application/wasm (middleware). The
    Dockerfile build runs copy-engine via bun, so the engine ships in dist/engine.
  - Deploy sequence (least privilege): (a) `fly apps create ludwig-chess`; (b)
    `fly deploy --ha=false --remote-only` (one machine, remote build); `fly scale
count 1`; verify EXACTLY ONE machine (`fly status`) + live smoke. (c) Create the
    PRIVATE repo WITHOUT pushing: `gh repo create nmamano/ludwig-chess --private
--source=. --remote=origin` (do not pass --push). (d) `fly tokens create deploy`
    piped DIRECTLY into `gh secret set FLY_API_TOKEN -R nmamano/ludwig-chess`; never
    print or retain the token. (e) Push master ONLY after the secret exists; the push
    triggers a second deploy via Actions, which MUST pass; confirm one machine after.
  - Workflow hardened: `permissions: contents: read`; setup-flyctl pinned to the
    immutable commit fc53c09 (tag 1.5); keep --ha=false.
  - Custom domain: `fly certs add ludwig.nilmamano.com` -> capture the EXACT
    fly-provided records (A/AAAA/CNAME exactly as fly states; do NOT infer from
    chess.nilmamano.com). PARKED-FOR-NIL: Nil adds them at the nilmamano.com DNS
    provider (I lack access). The .fly.dev URL is the working product meanwhile.
  - Credentialed actions run as Nil (pre-authorized 2026-06-18): gh repo create,
    fly apps create / deploy / certs / tokens, gh secret set, push. Announce each in
    chat; pipe any token-printing command through a sed redaction; never log the token.
- Acceptance criteria:
  - `bun run ci`, `bun run gate:e2e`, `bun run gate:prod` stay green.
  - fly --remote-only build succeeds; `bun run smoke:live <fly url>` passes
    (LIVE_SMOKE_PASS): two clients activate a room + one move, one client shows
    `window.__ludwigEval` source stockfish / updating false / finite depth, the
    worker js / wasm / license / og.png return 200 over the public origin, the public
    wasm is application/wasm, and /health is {ok:true,rooms:0}; exactly one fly machine.
  - Final domain gate (after Nil adds DNS): HTTPS cert ready and /health, app, OG
    image, worker, and wasm load from https://ludwig.nilmamano.com.
- Locked (do not relitigate): single fly machine, never scale past 1; engine
  frontend-only; app slug ludwig-chess + domain ludwig.nilmamano.com (Nil-approved);
  the exact fly-provided DNS records are parked-for-Nil; the deploy is gated on Nil's
  about $2/month approval; no em dashes.
- Resources: round-trip-chess/HANDOFF-DEPLOY.md (the deploy playbook this mirrors),
  ~/nil/rps-roulette and ~/nil/wallgame (read-only deploy refs), Dockerfile /
  fly.toml / .dockerignore / .github/workflows/fly-deploy.yml (present), fly CLI
  ~/.fly/bin/fly (authed), gh (authed as nmamano, scopes repo + workflow).
