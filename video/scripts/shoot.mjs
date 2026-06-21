// Capture real screenshots of the running Advisory Workbench for the pitch video.
// Drives the live app (backend :8000 + frontend :3000) with the system Chrome.
//   node scripts/shoot.mjs
// Output → public/shots/*.png

import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const OUT = "public/shots";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickText(page, selector, text, { exact = false } = {}) {
  const box = await page.evaluate(
    (sel, txt, ex) => {
      const els = Array.from(document.querySelectorAll(sel));
      const el = els.find((e) => {
        const t = (e.textContent || "").trim();
        return ex ? t === txt : t.includes(txt);
      });
      if (!el) return null;
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    selector,
    text,
    exact,
  );
  if (!box) throw new Error(`clickText: "${text}" (${selector}) not found`);
  await page.mouse.click(box.x, box.y);
}

// Clip the main content panel — the flex-1 sibling of the sidebar (i.e. the
// whole screen minus the left nav).
async function shotContent(page, file) {
  const box = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    const content = main.children[main.children.length - 1];
    const r = content.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box) throw new Error("content panel not found");
  await page.screenshot({
    path: `${OUT}/${file}`,
    clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
  });
  console.log(`  ✓ ${file} (${Math.round(box.width)}×${Math.round(box.height)})`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: { width: 1720, height: 1080, deviceScaleFactor: 2 },
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--window-size=1740,1110"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // ---- Overview (home) — content only, no sidebar ----
  console.log("→ overview");
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page
    .waitForFunction(() => /Priority|touch base|Meetings|market/i.test(document.body.innerText), { timeout: 30000 })
    .catch(() => console.log("  ! overview content wait timed out"));
  await sleep(2500);
  // Seed/example news URLs can't unfurl → grey link-preview placeholders.
  // Hide the thumbnail blocks for a clean shot, then restore.
  await page.evaluate(() => {
    const s = document.createElement("style");
    s.id = "__hidethumbs";
    s.textContent = ".aspect-video{display:none !important}";
    document.head.appendChild(s);
  });
  await sleep(400);
  await shotContent(page, "overview_content.png");
  await page.evaluate(() => document.getElementById("__hidethumbs")?.remove());

  // ---- Rendezvous for Schneider (big transatlantic route) — content only ----
  console.log("→ open Schneider");
  await clickText(page, "button", "Schneider");
  await sleep(1500);
  console.log("→ Client ▸ Rendezvous");
  await clickText(page, "button", "Client", { exact: true });
  await sleep(900);
  await clickText(page, "button", "Rendezvous", { exact: true });
  await page
    .waitForFunction(
      () => /What we know they enjoy|Conversation openers|place to convene/.test(document.body.innerText),
      { timeout: 30000 },
    )
    .catch(() => console.log("  ! rendezvous content wait timed out"));
  await sleep(8000); // globe paints the transatlantic arc
  await shotContent(page, "rendezvous_schneider.png");

  await browser.close();
  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
