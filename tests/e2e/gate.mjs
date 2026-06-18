// Real-browser dual-client gate. Boots ONE server instance on the reserved port
// 39280 (in-memory, isolated) and drives headless system-Chrome clients. Every
// assertion reads the AUTHORITATIVE evidence surface (window.__ludwig /
// window.__ludwigEval / window.__ludwigError), never rendered pixels; DOM use is
// limited to confirming the eval bar mounts. Screenshots are artifacts, never
// assertions. No quota, no keys, no external network.
//
// Run with: bun run gate:e2e  (which builds the frontend first).

import { chromium } from "playwright-core";
import { Chess } from "chess.js";
import app from "../../server/index.ts";

const PORT = 39280;
const BASE = `http://localhost:${PORT}`;
const TIMEOUT = 10000;

const server = Bun.serve({ port: PORT, fetch: app.fetch, websocket: app.websocket });

const checks = [];
let ok = true;
function check(name, cond) {
  checks.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) ok = false;
}

const errors = [];
const ludwig = (page) => page.evaluate(() => window.__ludwig);
const ludwigEval = (page) => page.evaluate(() => window.__ludwigEval);
const barMounts = async (page) =>
  (await page.locator('[aria-label="Material advantage bar"]').count()) > 0;

function evalShapeOk(ev, fen) {
  return (
    !!ev &&
    ev.source === "material" &&
    ev.fen === fen &&
    ev.mate === null &&
    ev.updating === false &&
    Number.isFinite(ev.whiteCp) &&
    Number.isFinite(ev.fillPct) &&
    ev.fillPct >= 0 &&
    ev.fillPct <= 100
  );
}

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

  // ---- Game A: 1a regression + 1b eval baseline ----
  const A = await connect(browser);
  {
    const l1 = await ludwig(A.p1);
    const l2 = await ludwig(A.p2);
    const e1 = await ludwigEval(A.p1);
    const e2 = await ludwigEval(A.p2);
    check("both clients reach the active game", l1.lobby === "active" && l2.lobby === "active");
    check("P1 holds white, P2 holds black", l1.you === "p1" && l2.you === "p2");
    check("both agree on the starting FEN", l1.fen === l2.fen);
    check("eval shape valid on P1 (source/fen/mate/updating/finite)", evalShapeOk(e1, l1.fen));
    check("eval shape valid on P2", evalShapeOk(e2, l2.fen));
    check(
      "both clients agree on the eval for the same FEN",
      l1.fen === l2.fen && e1.whiteCp === e2.whiteCp && e1.fillPct === e2.fillPct,
    );
    check(
      "start eval is even (cp 0, fill ~50, label 0.0)",
      e1.whiteCp === 0 && Math.abs(e1.fillPct - 50) < 1e-6 && e1.label === "0.0",
    );
    check("eval bar mounts on both clients", (await barMounts(A.p1)) && (await barMounts(A.p2)));
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
  const e4 = new Chess(a2.fen).get("e4");
  check(
    "white pawn sits on e4 (independent FEN check)",
    !!e4 && e4.type === "p" && e4.color === "w",
  );

  // An illegal move (injected through the real client socket) is rejected and does
  // NOT change the authoritative position. Black is to move.
  await sendMove(A.p2, "a7", "a4");
  await A.p2.waitForFunction(() => window.__ludwigError === "illegal_move", null, {
    timeout: TIMEOUT,
  });
  const b3 = await ludwig(A.p2);
  check("illegal move rejected as illegal_move", true);
  check("authoritative FEN unchanged after the illegal move", b3.fen === b2.fen);

  // Scripted checkmate (Scholar's mate, continuing from 1.e4).
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
  await Promise.all([
    A.p1.waitForFunction(() => window.__ludwig && window.__ludwig.result !== null, null, {
      timeout: TIMEOUT,
    }),
    A.p2.waitForFunction(() => window.__ludwig && window.__ludwig.result !== null, null, {
      timeout: TIMEOUT,
    }),
  ]);
  const af = await ludwig(A.p1);
  const bf = await ludwig(A.p2);
  const isMate = (r) => r && r.kind === "win" && r.winner === "white" && r.reason === "checkmate";
  check(
    "checkmate yields result win/white/checkmate on both clients",
    isMate(af.result) && isMate(bf.result),
  );

  await A.p1.screenshot({ path: "/tmp/ludwig-1b-final.png" });
  await A.ctxA.close();
  await A.ctxB.close();

  // ---- Game B: eval direction test (1.e4 d5 2.exd5 wins a pawn) ----
  const B = await connect(browser);
  const base = await ludwigEval(B.p1);
  check(
    "eval-direction baseline is even",
    base.whiteCp === 0 && Math.abs(base.fillPct - 50) < 1e-6,
  );

  await sendMove(B.p1, "e2", "e4");
  await bothTurn(B.p1, B.p2, "black");
  await sendMove(B.p2, "d7", "d5");
  await bothTurn(B.p1, B.p2, "white");
  await sendMove(B.p1, "e4", "d5"); // exd5: White wins a pawn
  await bothTurn(B.p1, B.p2, "black");

  const dl1 = await ludwig(B.p1);
  const dl2 = await ludwig(B.p2);
  const de1 = await ludwigEval(B.p1);
  const de2 = await ludwigEval(B.p2);
  check(
    "after exd5 eval shape still valid on both",
    evalShapeOk(de1, dl1.fen) && evalShapeOk(de2, dl2.fen),
  );
  check("after exd5 White cp increased from the even baseline", de1.whiteCp > base.whiteCp);
  check("after exd5 White fill increased past 50", de1.fillPct > 50);
  check(
    "after exd5 both clients agree on the eval",
    dl1.fen === dl2.fen && de1.whiteCp === de2.whiteCp && de1.fillPct === de2.fillPct,
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
