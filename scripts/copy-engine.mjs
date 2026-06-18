// Copies the single-threaded Stockfish worker assets from the installed npm
// package into frontend/public/engine so Vite serves them (and copies them into
// dist on build). Invoked by both the frontend `dev` and `build` scripts, so every
// entry point (dev server, production build, Docker frozen-install build, the e2e
// gate) gets the assets. Fails loudly if any required source file is missing, so we
// never ship a missing engine or a broken license link. The ~7MB wasm is
// gitignored, not committed.

import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here); // scripts/ -> repo root
const pkgDir = join(repoRoot, "frontend", "node_modules", "stockfish");
const destDir = join(repoRoot, "frontend", "public", "engine");

// All three are REQUIRED. The license is linked from the UI and bundled with the
// distributed worker, so a missing license must fail the build like a missing binary.
const ASSETS = [
  { src: "bin/stockfish-18-lite-single.js", dest: "stockfish-18-lite-single.js" },
  { src: "bin/stockfish-18-lite-single.wasm", dest: "stockfish-18-lite-single.wasm" },
  { src: "Copying.txt", dest: "stockfish-LICENSE.txt" },
];

for (const a of ASSETS) {
  if (!existsSync(join(pkgDir, a.src))) {
    console.error(`[copy-engine] MISSING required asset: ${join(pkgDir, a.src)}`);
    console.error(
      "[copy-engine] The stockfish package layout changed. Update scripts/copy-engine.mjs.",
    );
    process.exit(1);
  }
}

mkdirSync(destDir, { recursive: true });
for (const a of ASSETS) copyFileSync(join(pkgDir, a.src), join(destDir, a.dest));

console.log(`[copy-engine] copied ${ASSETS.length} engine assets (incl. license) to ${destDir}`);
