// Browser check for the World (agents appear, wheel/button zoom, drag-pan, select + overlays, no console errors).
// Not part of `npm test` (it needs a running stack and a browser). To run it:
//   npm i --no-save puppeteer-core           # once
//   (start the db, the API server and `npm run dev`, then seed a demo universe: server/scripts/seed_demo.py)
//   BROWSER_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
//     node scripts/world-check.mjs http://localhost:3001/admin/universes/<universe id>/world [screenshot dir]
// Headless GPU is software-rendered, so frame rates here say little about real hardware.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const puppeteer = createRequire(import.meta.url)("puppeteer-core");

const [, , url, outDir = path.resolve("world-shots")] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.BROWSER_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,1100"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  await page.goto(url, { waitUntil: "networkidle2", timeout: 240000 });
  await page.waitForFunction(() => window.__unifaiWorld?.snapshot().agents.length > 0, { timeout: 120000 });
  const snap = () => page.evaluate(() => window.__unifaiWorld.snapshot());
  const box = await (await page.$("canvas")).boundingBox();
  const shot = (n) => page.screenshot({ path: path.join(outDir, `${n}.png`) });

  let s = await snap();
  check("agents spawned", s.agents.length > 0, `${s.agents.length} agents`);
  await sleep(6000);
  await shot("1-overview");
  s = await snap();
  const states = s.agents.reduce((m, a) => ((m[a.state] = (m[a.state] ?? 0) + 1), m), {});
  check("agents are acting (walking/activity/sitting)", (states.WALKING ?? 0) + (states.ACTIVITY ?? 0) + (states.SITTING ?? 0) > 0, JSON.stringify(states));

  // Zoom with the wheel at the canvas centre.
  const before = s.scale;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel({ deltaY: -200 });
    await sleep(80);
  }
  await sleep(900);
  const zoomed = (await snap()).scale;
  check("wheel zooms in", zoomed > before * 1.2, `${before.toFixed(2)} -> ${zoomed.toFixed(2)}`);
  await page.click('button[aria-label="Zoom out"]');
  await sleep(900);
  check("zoom-out button works", (await snap()).scale < zoomed, "");

  // Drag to pan: an agent's on-screen position should move with the drag.
  await page.click('button[aria-label="Reset view"]');
  await sleep(1200);
  const a0 = (await snap()).agents.find((a) => a.x > box.x + 80 && a.x < box.x + box.width - 80) ?? (await snap()).agents[0];
  const startX = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.8;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 160, startY + 40, { steps: 8 });
  await page.mouse.up();
  await sleep(500);
  const a1 = (await snap()).agents.find((a) => a.id === a0.id);
  check("drag pans the map", Math.abs(a1.x - a0.x) > 60, `dx=${(a1.x - a0.x).toFixed(0)}`);
  await page.click('button[aria-label="Reset view"]');
  await sleep(1200);

  // Select an agent by clicking its sprite.
  const target = (await snap()).agents.find((a) => a.x > box.x + 120 && a.x < box.x + box.width - 120 && a.y > box.y + 120 && a.y < box.y + box.height - 120);
  await page.mouse.click(target.x + box.x - (await page.evaluate(() => 0)), target.y + box.y);
  await sleep(900);
  s = await snap();
  check("click selects an agent", s.selected === target.id, `selected=${s.selected}`);
  const ui = await page.evaluate(() => ({
    bio: Boolean(document.querySelector('section[aria-label$="agent"]')),
    pipeline: Boolean(document.querySelector('section[aria-label="Pipeline"]')),
  }));
  check("bio card and pipeline HUD shown", ui.bio && ui.pipeline);
  await shot("2-selected");

  const real = errors.filter((e) => !/favicon|DevTools/.test(e));
  check("no console or page errors", real.length === 0, real.slice(0, 4).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `${failed} failed` : "all world checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
