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

// Click via a real mouse event at the element's centre — Radix tabs/menus
// ignore synthetic .click(). `exact` matches the trimmed text exactly.
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

// Screenshot the element whose text contains `text` — climbing to a card/section
// ancestor so we crop a clean panel, not just the inner node.
async function shotSection(page, text, file, { pad = 0 } = {}) {
  const box = await page.evaluate((txt) => {
    const all = Array.from(document.querySelectorAll("section, .card, div"));
    const match = all.find((e) => (e.textContent || "").includes(txt));
    if (!match) return null;
    // climb to the nearest .card / section for a tidy crop
    let el = match;
    for (let i = 0; i < 6 && el.parentElement; i++) {
      if (el.classList?.contains("card") || el.tagName === "SECTION") break;
      el = el.parentElement;
    }
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, text);
  if (!box || box.width < 30 || box.height < 30) {
    console.log(`  ! section "${text}" not found — skipping ${file}`);
    return false;
  }
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
  await page.screenshot({ path: `${OUT}/${file}`, clip });
  console.log(`  ✓ ${file}`);
  return true;
}

// Crop the ancestor `levelsUp` above the element whose text contains `text`.
// Scrolls it into view first so it's actually painted.
async function shotParent(page, text, file, { levelsUp = 1, pad = 10 } = {}) {
  const box = await page.evaluate(
    (txt, up) => {
      const all = Array.from(document.querySelectorAll("p, span, h1, h2, h3, div"));
      const hit = all.find((e) => (e.textContent || "").trim() === txt) ||
        all.find((e) => (e.textContent || "").includes(txt));
      if (!hit) return null;
      let el = hit;
      for (let i = 0; i < up && el.parentElement; i++) el = el.parentElement;
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    text,
    levelsUp,
  );
  if (!box || box.width < 30 || box.height < 20) {
    console.log(`  ! "${text}" not found — skipping ${file}`);
    return false;
  }
  await sleep(250);
  // re-measure after scroll settled
  const box2 = await page.evaluate(
    (txt, up) => {
      const all = Array.from(document.querySelectorAll("p, span, h1, h2, h3, div"));
      const hit = all.find((e) => (e.textContent || "").trim() === txt) ||
        all.find((e) => (e.textContent || "").includes(txt));
      let el = hit;
      for (let i = 0; i < up && el.parentElement; i++) el = el.parentElement;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    text,
    levelsUp,
  );
  const b = box2 || box;
  const clip = {
    x: Math.max(0, b.x - pad),
    y: Math.max(0, b.y - pad),
    width: Math.min(b.width + pad * 2, 1680 - Math.max(0, b.x - pad)),
    height: Math.min(b.height + pad * 2, 1050 - Math.max(0, b.y - pad)),
  };
  await page.screenshot({ path: `${OUT}/${file}`, clip });
  console.log(`  ✓ ${file}`);
  return true;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: { width: 1680, height: 1050, deviceScaleFactor: 2 },
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--window-size=1700,1080"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  console.log("→ open app");
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await sleep(1500);

  console.log("→ open Räber");
  await clickText(page, "button", "ber"); // "Eugen Räber" in the sidebar
  await sleep(1500);

  // ---- Rendezvous ----
  console.log("→ Client ▸ Rendezvous");
  await clickText(page, "button", "Client", { exact: true });
  await sleep(900);
  await clickText(page, "button", "Rendezvous", { exact: true });
  // wait until the planner has actually rendered (not the loading text)
  await page
    .waitForFunction(
      () => /What we know they enjoy|Conversation openers|place to convene/.test(document.body.innerText),
      { timeout: 30000 },
    )
    .catch(() => console.log("  ! rendezvous content wait timed out"));
  await sleep(3500); // let the globe paint
  await page.screenshot({ path: `${OUT}/rendezvous_full.png` });
  console.log("  ✓ rendezvous_full.png");
  await shotParent(page, "What we know they enjoy", "rendezvous_interests.png", { levelsUp: 1, pad: 10 });
  await shotParent(page, "Conversation openers", "rendezvous_talking.png", { levelsUp: 1, pad: 10 });
  await shotParent(page, "place to convene", "rendezvous_meeting.png", { levelsUp: 3, pad: 8 });

  // ---- Capture · voice mode ----
  console.log("→ Add note (capture)");
  await clickText(page, "button", "Add note");
  await sleep(1500);

  console.log("→ start Voice interview");
  try {
    await clickText(page, "button", "Voice interview");
    await sleep(2800); // first follow-up question fetched + spoken
    await shotParent(page, "Voice", "voice_question.png", { levelsUp: 4, pad: 8 });
  } catch (e) {
    console.log("  ! voice interview button unavailable:", e.message);
  }

  // type a note (as if dictated through the interview) → Extract → sentiment/risk
  console.log("→ type note + Extract signals");
  const NOTE =
    "Lunch at the Kronenhalle. Eugen was relaxed; proud of his grandson starting an engineering apprenticeship. He reaffirmed he wants steady, dependable dividends and is wary of anything speculative. Keen to set aside more for the grandchildren.";
  await page.evaluate((note) => {
    const ta = document.querySelector("textarea");
    if (!ta) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, note);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, NOTE);
  await sleep(500);
  await clickText(page, "button", "Extract signals");
  await page
    .waitForFunction(() => /Risk-timeline preview/.test(document.body.innerText), { timeout: 20000 })
    .catch(() => console.log("  ! staged panel wait timed out"));
  await sleep(1200);
  // the risk preview block = label + sentiment/risk chips (parent of the label)
  await shotParent(page, "Risk-timeline preview", "voice_sentiment.png", { levelsUp: 1, pad: 14 });
  // also the detected-topics / proposed-edge classification, just below
  await shotParent(page, "Detected topics", "voice_topics.png", { levelsUp: 1, pad: 14 });

  await browser.close();
  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
