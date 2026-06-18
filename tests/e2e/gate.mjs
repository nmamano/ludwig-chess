// Real-browser dual-client gate for slice 1a. Boots ONE server instance on the
// reserved port 39280 (in-memory, isolated) and drives two headless system-Chrome
// clients. Every assertion reads the AUTHORITATIVE evidence surface
// (window.__ludwig / window.__ludwigError), never rendered pixels. Screenshots are
// artifacts, never assertions. No quota, no keys, no external network.
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

const ludwig = (page) => page.evaluate(() => window.__ludwig);

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

let browser;
const errors = [];
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const p1 = await (await browser.newContext()).newPage();
  const p2 = await (await browser.newContext()).newPage();
  p1.on("pageerror", (e) => errors.push(`p1 PAGEERROR: ${e.message}`));
  p2.on("pageerror", (e) => errors.push(`p2 PAGEERROR: ${e.message}`));

  // 1) P1 creates a room.
  await p1.goto(BASE, { waitUntil: "domcontentloaded" });
  await p1.click('button:has-text("Create game")');
  await p1.waitForFunction(
    () => window.__ludwig && window.__ludwig.lobby === "waiting" && window.__ludwig.code,
    null,
    { timeout: TIMEOUT },
  );
  const code = (await ludwig(p1)).code;
  check("P1 created a room with a 4-char code", typeof code === "string" && code.length === 4);

  // 2) P2 joins via the share link.
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
  const a1 = await ludwig(p1);
  const b1 = await ludwig(p2);
  check("both clients reach the active game", a1.lobby === "active" && b1.lobby === "active");
  check("P1 holds white, P2 holds black", a1.you === "p1" && b1.you === "p2");
  check("both agree on the starting FEN", a1.fen === b1.fen);

  // 3) A real UI-click move proves the click path: P1 plays e2-e4.
  await p1.click('[aria-label^="e2 "]');
  await p1.click('[aria-label^="e4 "]');
  await bothTurn(p1, p2, "black");
  const a2 = await ludwig(p1);
  const b2 = await ludwig(p2);
  check("the UI move reflected identically on both clients", a2.fen === b2.fen);
  check("the move changed the authoritative position", a2.fen !== a1.fen);
  check(
    "lastMove records e2-e4",
    a2.lastMove && a2.lastMove.from === "e2" && a2.lastMove.to === "e4",
  );
  const e4 = new Chess(a2.fen).get("e4");
  check(
    "white pawn sits on e4 (independent FEN check)",
    !!e4 && e4.type === "p" && e4.color === "w",
  );

  // 4) An illegal move (injected through the real client socket) is rejected and
  // does NOT change the authoritative position. Black is to move.
  await sendMove(p2, "a7", "a4"); // a pawn cannot jump three
  await p2.waitForFunction(() => window.__ludwigError === "illegal_move", null, {
    timeout: TIMEOUT,
  });
  const b3 = await ludwig(p2);
  check("illegal move rejected as illegal_move", true);
  check("authoritative FEN unchanged after the illegal move", b3.fen === b2.fen);

  // 5) Scripted checkmate (Scholar's mate, continuing from 1.e4): 1...e5 2.Bc4 Nc6
  // 3.Qh5 Nf6 4.Qxf7#. Driven through the real client sockets.
  await sendMove(p2, "e7", "e5");
  await bothTurn(p1, p2, "white");
  await sendMove(p1, "f1", "c4");
  await bothTurn(p1, p2, "black");
  await sendMove(p2, "b8", "c6");
  await bothTurn(p1, p2, "white");
  await sendMove(p1, "d1", "h5");
  await bothTurn(p1, p2, "black");
  await sendMove(p2, "g8", "f6");
  await bothTurn(p1, p2, "white");
  await sendMove(p1, "h5", "f7"); // Qxf7#
  await Promise.all([
    p1.waitForFunction(() => window.__ludwig && window.__ludwig.result !== null, null, {
      timeout: TIMEOUT,
    }),
    p2.waitForFunction(() => window.__ludwig && window.__ludwig.result !== null, null, {
      timeout: TIMEOUT,
    }),
  ]);
  const af = await ludwig(p1);
  const bf = await ludwig(p2);
  const isMate = (r) => r && r.kind === "win" && r.winner === "white" && r.reason === "checkmate";
  check("checkmate yields result win/white/checkmate on P1", isMate(af.result));
  check("checkmate yields the same result on P2", isMate(bf.result));
  check("both clients agree on the final FEN", af.fen === bf.fen);

  // Evidence artifact (never an assertion).
  await p1.screenshot({ path: "/tmp/ludwig-1a-final.png" });

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
