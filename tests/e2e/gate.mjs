// Real-browser dual-client gate. Boots ONE server instance on the reserved port
// 39280 (in-memory, isolated) and drives headless system-Chrome clients with the
// real client-side Stockfish engine. Every assertion reads the AUTHORITATIVE
// evidence surface (window.__ludwig / window.__ludwigEval / window.__ludwigError),
// never rendered pixels; DOM use is limited to confirming the bar mounts and
// clicking squares. Screenshots are artifacts, never assertions. No quota, no keys.
// Each browser context loads its own engine; we never require cross-client exact
// equality, only shape and direction.
//
// Run with: bun run gate:e2e  (which builds the frontend, copying the engine).

import { chromium } from "playwright-core";
import app from "../../server/index.ts";

const PORT = 39280;
const BASE = `http://localhost:${PORT}`;
const TIMEOUT = 10000; // connection / turn waits
const ENGINE_TIMEOUT = 45000; // engine load (7MB) + 1s think

const server = Bun.serve({ port: PORT, fetch: app.fetch, websocket: app.websocket });

const checks = [];
let ok = true;
function check(name, cond) {
  checks.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) ok = false;
}

const errors = [];
const ludwig = (page) => page.evaluate(() => window.__ludwig);
const barMounts = async (page) =>
  (await page.locator('[aria-label="Material advantage bar"]').count()) > 0;

function waitTurn(page, color) {
  return page.waitForFunction((c) => window.__ludwig && window.__ludwig.turn === c, color, {
    timeout: TIMEOUT,
  });
}
async function bothTurn(p1, p2, color) {
  await Promise.all([waitTurn(p1, color), waitTurn(p2, color)]);
}
function sendMove(page, from, to, promotion) {
  return page.evaluate(
    ([f, t, p]) => window.__ludwigMove(f, t, p || undefined),
    [from, to, promotion ?? null],
  );
}

// Engine evidence helpers (judge on window.__ludwigEval, correlated to __ludwig.fen).
function waitUpdating(page) {
  return page.waitForFunction(
    () => {
      const e = window.__ludwigEval;
      const l = window.__ludwig;
      return !!(e && l && e.fen === l.fen && e.updating === true);
    },
    null,
    { timeout: ENGINE_TIMEOUT },
  );
}
async function waitDone(page) {
  await page.waitForFunction(
    () => {
      const e = window.__ludwigEval;
      const l = window.__ludwig;
      return !!(
        e &&
        l &&
        e.fen === l.fen &&
        e.updating === false &&
        Number.isFinite(e.depth) &&
        (Number.isFinite(e.whiteCp) || Number.isFinite(e.mate))
      );
    },
    null,
    { timeout: ENGINE_TIMEOUT },
  );
  return page.evaluate(() => window.__ludwigEval);
}
async function waitTerminal(page) {
  await page.waitForFunction(
    () => {
      const e = window.__ludwigEval;
      const l = window.__ludwig;
      return !!(e && l && e.fen === l.fen && e.updating === false && l.result !== null);
    },
    null,
    { timeout: ENGINE_TIMEOUT },
  );
  return page.evaluate(() => window.__ludwigEval);
}

async function connect(browser) {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const p1 = await ctxA.newPage();
  const p2 = await ctxB.newPage();
  p1.on("pageerror", (e) => errors.push(`p1 PAGEERROR: ${e.message}`));
  p2.on("pageerror", (e) => errors.push(`p2 PAGEERROR: ${e.message}`));

  await p1.goto(BASE, { waitUntil: "domcontentloaded" });
  await p1.click('button:has-text("Create game")');
  await p1.waitForFunction(
    () => window.__ludwig && window.__ludwig.lobby === "waiting" && window.__ludwig.code,
    null,
    { timeout: TIMEOUT },
  );
  const code = (await ludwig(p1)).code;

  await p2.goto(`${BASE}/?room=${code}`, { waitUntil: "domcontentloaded" });
  await p2.click('button:has-text("Join")');
  await Promise.all([
    p1.waitForFunction(() => window.__ludwig && window.__ludwig.lobby === "active", null, {
      timeout: TIMEOUT,
    }),
    p2.waitForFunction(() => window.__ludwig && window.__ludwig.lobby === "active", null, {
      timeout: TIMEOUT,
    }),
  ]);
  return { p1, p2, code, ctxA, ctxB };
}

let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  // ---- Game A: engine baseline + UI move + updating transition + terminal ----
  const A = await connect(browser);
  {
    const l1 = await ludwig(A.p1);
    const l2 = await ludwig(A.p2);
    check("both clients reach the active game", l1.lobby === "active" && l2.lobby === "active");
    check("P1 holds white, P2 holds black", l1.you === "p1" && l2.you === "p2");
    check("both agree on the starting FEN", l1.fen === l2.fen);
    check("eval bar mounts on both clients", (await barMounts(A.p1)) && (await barMounts(A.p2)));

    // The engine evaluates the start position on each client.
    await waitUpdating(A.p1);
    const se1 = await waitDone(A.p1);
    const se2 = await waitDone(A.p2);
    check(
      "start eval is from stockfish with finite depth (P1)",
      se1.source === "stockfish" && Number.isFinite(se1.depth),
    );
    check(
      "start eval is from stockfish with finite depth (P2)",
      se2.source === "stockfish" && Number.isFinite(se2.depth),
    );
    check(
      "start eval cp is finite and small on P1",
      Number.isFinite(se1.whiteCp) && Math.abs(se1.whiteCp) < 200,
    );
    check(
      "start eval fen correlates with the authoritative fen",
      se1.fen === l1.fen && se2.fen === l2.fen,
    );
  }

  // A real UI-click move proves the click path: P1 plays e2-e4.
  await A.p1.click('[aria-label^="e2 "]');
  await A.p1.click('[aria-label^="e4 "]');
  await bothTurn(A.p1, A.p2, "black");
  const a2 = await ludwig(A.p1);
  const b2 = await ludwig(A.p2);
  check("the UI move reflected identically on both clients", a2.fen === b2.fen);
  check(
    "lastMove records e2-e4",
    a2.lastMove && a2.lastMove.from === "e2" && a2.lastMove.to === "e4",
  );

  // Updating transition (adjustment 7): updating true for the new fen, then false + finite depth.
  await waitUpdating(A.p1);
  const e4eval = await waitDone(A.p1);
  check(
    "post-move eval transitions to done with finite depth on the new fen",
    e4eval.fen === a2.fen && e4eval.updating === false && Number.isFinite(e4eval.depth),
  );

  // Illegal move (1a regression): injected, rejected, position unchanged. Black to move.
  await sendMove(A.p2, "a7", "a4");
  await A.p2.waitForFunction(() => window.__ludwigError === "illegal_move", null, {
    timeout: TIMEOUT,
  });
  const b3 = await ludwig(A.p2);
  check("illegal move rejected and authoritative FEN unchanged", b3.fen === b2.fen);

  // Scholar's mate to a terminal position; assert the terminal short-circuit mapping.
  await sendMove(A.p2, "e7", "e5");
  await bothTurn(A.p1, A.p2, "white");
  await sendMove(A.p1, "f1", "c4");
  await bothTurn(A.p1, A.p2, "black");
  await sendMove(A.p2, "b8", "c6");
  await bothTurn(A.p1, A.p2, "white");
  await sendMove(A.p1, "d1", "h5");
  await bothTurn(A.p1, A.p2, "black");
  await sendMove(A.p2, "g8", "f6");
  await bothTurn(A.p1, A.p2, "white");
  await sendMove(A.p1, "h5", "f7"); // Qxf7#
  const tev = await waitTerminal(A.p1);
  check(
    "terminal eval: White win pins the bar (mate>0, fill high, not updating)",
    tev.updating === false && tev.mate > 0 && tev.fillPct >= 90 && tev.depth === null,
  );

  await A.p1.screenshot({ path: "/tmp/ludwig-1c-final.png" });
  await A.ctxA.close();
  await A.ctxB.close();

  // ---- Game B: blunder swing (1.e4 e5 2.Qh5 Nc6 3.Qxe5+ Nxe5) ----
  const B = await connect(browser);
  await sendMove(B.p1, "e2", "e4");
  await bothTurn(B.p1, B.p2, "black");
  await sendMove(B.p2, "e7", "e5");
  await bothTurn(B.p1, B.p2, "white");
  await sendMove(B.p1, "d1", "h5");
  await bothTurn(B.p1, B.p2, "black");
  await sendMove(B.p2, "b8", "c6");
  await bothTurn(B.p1, B.p2, "white");
  const evA = await waitDone(B.p1); // completed eval after Nc6 (White to move)

  await sendMove(B.p1, "h5", "e5"); // Qxe5+ (the blunder)
  await bothTurn(B.p1, B.p2, "black");
  await sendMove(B.p2, "c6", "e5"); // Nxe5 wins the queen
  await bothTurn(B.p1, B.p2, "white");
  const evB1 = await waitDone(B.p1); // completed eval after Nxe5 (White to move, down a queen)
  const evB2 = await waitDone(B.p2);

  check(
    "blunder swing: White cp falls by at least 300",
    Number.isFinite(evA.whiteCp) &&
      Number.isFinite(evB1.whiteCp) &&
      evB1.whiteCp <= evA.whiteCp - 300,
  );
  check(
    "after the blunder the eval is in Black's favor (negative)",
    Number.isFinite(evB1.whiteCp) && evB1.whiteCp < 0,
  );
  check(
    "the other client agrees on direction for the same fen",
    Number.isFinite(evB2.whiteCp) && evB2.whiteCp < 0 && evB2.fen === evB1.fen,
  );
  await B.ctxA.close();
  await B.ctxB.close();

  check("no uncaught page errors", errors.length === 0);
} catch (err) {
  ok = false;
  checks.push(`FAIL  threw: ${err && err.message ? err.message : err}`);
} finally {
  if (browser) await browser.close();
  server.stop(true);
}

console.log("PAGE_ERRORS=" + JSON.stringify(errors));
console.log(checks.join("\n"));
console.log(ok ? "GATE_PASS" : "GATE_FAIL");
process.exit(ok ? 0 : 1);
