// Local pre-deploy gate: build the production Docker image from a CLEAN context
// (frontend/public/engine is dockerignored, so the image must regenerate the engine
// assets from installed deps via copy-engine) and smoke the running container. This
// catches Docker / engine-packaging issues before spending a fly deploy.
//
// Run with: bun scripts/gate-docker.mjs   (requires docker)

import { spawnSync } from "node:child_process";

const PORT = 39290;
const NAME = "ludwig-gate";
const BASE = `http://localhost:${PORT}`;

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const checks = [];
let ok = true;
function check(name, cond) {
  checks.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) ok = false;
}

sh("docker", ["rm", "-f", NAME]); // clear any leftover

console.log("[gate-docker] building image (engine assets regenerated in-image)...");
const build = sh("docker", ["build", "-t", "ludwig-local", "."], { stdio: "inherit" });
if (build.status !== 0) {
  console.log("DOCKER_GATE_FAIL (build failed)");
  process.exit(1);
}

const run = sh("docker", ["run", "-d", "--name", NAME, "-p", `${PORT}:3000`, "ludwig-local"]);
if (run.status !== 0) {
  console.log(run.stderr || run.stdout);
  console.log("DOCKER_GATE_FAIL (run failed)");
  process.exit(1);
}

try {
  // Wait for the server to come up.
  let health = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) {
        health = await r.json();
        break;
      }
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  check("/health returns {ok:true,rooms:0}", !!health && health.ok === true && health.rooms === 0);

  const ASSETS = [
    "/engine/stockfish-18-lite-single.js",
    "/engine/stockfish-18-lite-single.wasm",
    "/engine/stockfish-LICENSE.txt",
  ];
  for (const path of ASSETS) {
    const r = await fetch(`${BASE}${path}`);
    const body = await r.arrayBuffer();
    check(`200 + nonzero content for ${path}`, r.status === 200 && body.byteLength > 0);
  }

  const wasm = await fetch(`${BASE}/engine/stockfish-18-lite-single.wasm`);
  const ct = wasm.headers.get("content-type") || "";
  check(`wasm content-type is application/wasm (got: ${ct})`, ct.includes("application/wasm"));

  const index = await fetch(`${BASE}/`);
  check("/ (SPA index) returns 200", index.status === 200);
} catch (err) {
  ok = false;
  checks.push(`FAIL  threw: ${err && err.message ? err.message : err}`);
} finally {
  sh("docker", ["rm", "-f", NAME]);
}

console.log(checks.join("\n"));
console.log(ok ? "DOCKER_GATE_PASS" : "DOCKER_GATE_FAIL");
process.exit(ok ? 0 : 1);
