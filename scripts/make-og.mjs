// Generates frontend/public/og.png, the 2400x1260 social card, by rendering an
// HTML card in headless Chrome and screenshotting it. Run manually when the card
// design changes: `bun scripts/make-og.mjs`. The PNG is committed (unlike the
// engine assets); this script just documents how it was produced.

import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const W = 2400;
const H = 1260;
const out = join(dirname(dirname(fileURLToPath(import.meta.url))), "frontend", "public", "og.png");

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;800&family=Inter:wght@500;600&display=swap"
      rel="stylesheet"
    />
    <style>
      * { margin: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; }
      body {
        font-family: "Inter", system-ui, sans-serif;
        background: radial-gradient(120% 120% at 0% 0%, #2f4a36 0%, #1c2b22 55%, #141d18 100%);
        color: #eef3ee;
        display: flex;
        align-items: center;
        gap: 120px;
        padding: 120px 150px;
      }
      .left { flex: 1; }
      .brand {
        font-family: "Outfit", sans-serif;
        font-weight: 800;
        font-size: 188px;
        line-height: 0.95;
        letter-spacing: -4px;
      }
      .brand .accent { color: #7fb069; }
      .tag {
        margin-top: 44px;
        font-size: 54px;
        font-weight: 600;
        color: #c8d4c8;
        max-width: 1120px;
        line-height: 1.25;
      }
      .url {
        margin-top: 66px;
        font-family: "Outfit", sans-serif;
        font-weight: 700;
        font-size: 46px;
        color: #7fb069;
        letter-spacing: 1px;
      }
      .right { display: flex; align-items: stretch; gap: 28px; height: 600px; }
      .bar {
        width: 66px;
        border-radius: 14px;
        overflow: hidden;
        background: #0d130f;
        position: relative;
        border: 5px solid #0d130f;
      }
      .barfill { position: absolute; left: 0; right: 0; bottom: 0; height: 63%; background: #f3f5f2; }
      .barmid { position: absolute; left: 0; right: 0; top: 50%; height: 3px; background: #5b6b5e; }
      .board {
        width: 600px;
        height: 600px;
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        border-radius: 18px;
        overflow: hidden;
        border: 7px solid #0d130f;
        box-shadow: 0 32px 90px rgba(0, 0, 0, 0.5);
      }
      .sq { width: 100%; aspect-ratio: 1; }
    </style>
  </head>
  <body>
    <div class="left">
      <div class="brand">Ludwig<br /><span class="accent">Chess</span></div>
      <div class="tag">Standard chess with a live Stockfish evaluation bar. Blunder, and watch it swing.</div>
      <div class="url">ludwig.nilmamano.com</div>
    </div>
    <div class="right">
      <div class="bar"><div class="barfill"></div><div class="barmid"></div></div>
      <div class="board" id="board"></div>
    </div>
    <script>
      const b = document.getElementById("board");
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          const d = document.createElement("div");
          d.className = "sq";
          d.style.background = (r + c) % 2 === 0 ? "#e8e0cf" : "#6f8f5f";
          b.appendChild(d);
        }
    </script>
  </body>
</html>`;

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log("wrote " + out);
