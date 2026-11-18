// Records a screen video of site.html (scroll, open the menu, hover, scroll on)
// to use as input for Recode AI.   node record.mjs [out-dir]
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// CommonJS resolution so a globally installed playwright (NODE_PATH) also works
const { chromium } = createRequire(import.meta.url)("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? join(here, "out"));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: out, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
await page.goto(pathToFileURL(join(here, "site.html")).href);
const wait = (ms) => page.waitForTimeout(ms);
const scroll = async (to, steps = 40) => {
  const from = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.evaluate((y) => window.scrollTo(0, y), from + (to - from) * t * t * (3 - 2 * t));
    await wait(30);
  }
};
await wait(1000);
await scroll(700);
await wait(600);
await page.hover(".card:nth-child(2)");
await wait(700);
await page.click("#toggle");
await wait(1200);
await page.click("#toggle");
await wait(700);
await scroll(10000, 50);
await wait(1000);
await context.close();
await browser.close();
const video = readdirSync(out).find((f) => f.endsWith(".webm"));
renameSync(join(out, video), join(out, "northwind.webm"));
console.log(join(out, "northwind.webm"));
