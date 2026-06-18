// Post-deploy live smoke against the public origin. Two isolated browser contexts
// activate a room and make one real move; eval is asserted on ONE client (the engine
// is per-client, dual-client is covered locally). Also verifies the worker JS / wasm
// / license return 200 over the public origin and /health is healthy.
//
// Run with: bun scripts/smoke-live.mjs https://ludwig-chess.fly.dev

import { chromium } from "playwright-core";

const BASE = (process.argv[2] || process.env.LUDWIG_URL || "https://ludwig-chess.fly.dev").replace(
  /\/$/,
  "",
);
const TIMEOUT = 15000;
const ENGINE_TIMEOUT = 60000;

const checks = [];
let ok = true;
function check(name, cond) {
  checks.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) ok = false;
}

const ludwig = (page) => page.evaluate(() => window.__ludwig);

async function httpOk(path) {
  try {
    const r = await fetch(`${BASE}${path}`);
    const body = await r.arrayBuffer();
    return { status: r.status, len: body.byteLength, ct: r.headers.get("content-type") || "" };
  } catch (e) {
    return { status: 0, len: 0, ct: "", err: String(e) };
  }
}

let browser;
try {
  console.log(`[smoke-live] target ${BASE}`);

  const health = await fetch(`${BASE}/health`).then((r) => (r.ok ? r.json() : null));
  check("/health returns {ok:true,rooms:0}", !!health && health.ok === true && health.rooms === 0);

  for (const path of [
    "/engine/stockfish-18-lite-single.js",
    "/engine/stockfish-18-lite-single.wasm",
    "/engine/stockfish-LICENSE.txt",
    "/og.png",
  ]) {
    const r = await httpOk(path);
    check(`200 + nonzero for ${path}`, r.status === 200 && r.len > 0);
  }
  const wasmRes = await httpOk("/engine/stockfish-18-lite-single.wasm");
  check(
    `public wasm content-type is application/wasm (got: ${wasmRes.ct})`,
    wasmRes.ct.includes("application/wasm"),
  );

  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const p1 = await ctxA.newPage();
  const p2 = await ctxB.newPage();
  const errors = [];
  p1.on("pageerror", (e) => errors.push(`p1 ${e.message}`));
  p2.on("pageerror", (e) => errors.push(`p2 ${e.message}`));

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
  check("two clients activate a room over the public origin", true);

  const startFen = (await ludwig(p1)).fen;
  await p1.click('[aria-label^="e2 "]');
  await p1.click('[aria-label^="e4 "]');
  await p1.waitForFunction((f) => window.__ludwig && window.__ludwig.fen !== f, startFen, {
    timeout: TIMEOUT,
  });
  check("a real UI move changed the authoritative fen", (await ludwig(p1)).fen !== startFen);

  // The live engine produces a completed eval for the new position.
  await p1.waitForFunction(
    () => {
      const e = window.__ludwigEval;
      const l = window.__ludwig;
      return !!(
        e &&
        l &&
        e.fen === l.fen &&
        e.source === "stockfish" &&
        e.updating === false &&
        Number.isFinite(e.depth) &&
        (Number.isFinite(e.whiteCp) || Number.isFinite(e.mate))
      );
    },
    null,
    { timeout: ENGINE_TIMEOUT },
  );
  const ev = await p1.evaluate(() => window.__ludwigEval);
  check(
    "live engine eval is stockfish, done, finite (source/depth)",
    ev.source === "stockfish" && ev.updating === false && Number.isFinite(ev.depth),
  );
  check("no uncaught page errors", errors.length === 0);
} catch (err) {
  ok = false;
  checks.push(`FAIL  threw: ${err && err.message ? err.message : err}`);
} finally {
  if (browser) await browser.close();
}

console.log(checks.join("\n"));
console.log(ok ? "LIVE_SMOKE_PASS" : "LIVE_SMOKE_FAIL");
process.exit(ok ? 0 : 1);
