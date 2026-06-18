// Non-docker production gate. Proves a CLEAN build regenerates the engine assets
// from installed deps (not inherited local files), then serves the production build
// (the same `bun run start` the container runs) and asserts the engine assets +
// /health are served correctly: 200, nonzero length, and application/wasm for the
// wasm. This is the local substitute where the docker daemon is unavailable; the
// fly --remote-only build exercises the actual Dockerfile at deploy time.
//
// Run with: bun scripts/gate-prod.mjs

import { spawnSync, spawn } from "node:child_process";
import { rmSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const engineDir = join(root, "frontend", "public", "engine");
const distEngine = join(root, "frontend", "dist", "engine");
const PORT = 39290;
const BASE = `http://localhost:${PORT}`;
const ASSETS = [
  "stockfish-18-lite-single.js",
  "stockfish-18-lite-single.wasm",
  "stockfish-LICENSE.txt",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const checks = [];
let ok = true;
const check = (n, c) => {
  checks.push(`${c ? "PASS" : "FAIL"}  ${n}`);
  if (!c) ok = false;
};

// 1. Clean state: remove the generated engine assets so the build must regenerate.
rmSync(engineDir, { recursive: true, force: true });
check("engine assets removed before the build", !existsSync(engineDir));

// 2. Clean build: copy-engine regenerates from frontend deps, vite copies to dist.
const build = spawnSync("bun", ["run", "build"], { cwd: root, encoding: "utf8" });
check("clean build succeeds", build.status === 0);
for (const f of ASSETS) {
  const p = join(distEngine, f);
  check(`dist/engine regenerated ${f} (nonzero)`, existsSync(p) && statSync(p).size > 0);
}

// 3. Serve the production build and check the assets over HTTP.
const srv = spawn("bun", ["run", "start"], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
  stdio: "ignore",
});
try {
  let health = null;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) {
        health = await r.json();
        break;
      }
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  check("/health returns {ok:true,rooms:0}", !!health && health.ok === true && health.rooms === 0);

  for (const f of ASSETS) {
    const r = await fetch(`${BASE}/engine/${f}`);
    const b = await r.arrayBuffer();
    check(`200 + nonzero for /engine/${f}`, r.status === 200 && b.byteLength > 0);
  }
  const w = await fetch(`${BASE}/engine/stockfish-18-lite-single.wasm`);
  const ct = w.headers.get("content-type") || "";
  check(`wasm content-type is application/wasm (got: ${ct})`, ct.includes("application/wasm"));

  const idx = await fetch(`${BASE}/`);
  check("/ (SPA index) returns 200", idx.status === 200);
} catch (err) {
  ok = false;
  checks.push(`FAIL  threw: ${err && err.message ? err.message : err}`);
} finally {
  srv.kill("SIGKILL");
}

console.log(checks.join("\n"));
console.log(ok ? "PROD_GATE_PASS" : "PROD_GATE_FAIL");
process.exit(ok ? 0 : 1);
