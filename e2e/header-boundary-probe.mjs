// Stop scrolling exactly at the PageHeader collapse threshold and verify the
// header settles (no scroll-anchoring flip-flop, no stuck half-state).
// Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/header-boundary-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const OUT = "/tmp/pageshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const email = `hdr-${Date.now()}@test.local`;
const reg = await page.evaluate(async (email) => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }) });
  return r.status;
}, email);
if (reg !== 201) throw new Error("register failed: " + reg);

// seed notes so the stats page has real scroll range
await page.evaluate(async () => {
  const post = (url, body) => fetch(url, { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const s1 = await (await post("/api/skills", { name: "Half Out", code: "801<", difficulty: 1.1, isDrill: 0 })).json();
  for (const d of [0, 1, 2, 3, 5, 7, 9, 12, 20, 40]) {
    const date = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    await post("/api/notes", { date, content: `Session ${d}`, skills: JSON.stringify([{ id: s1.id, turns: 3 }]), rating: 4 });
  }
});

await page.goto(BASE + "/stats", { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="range-week"]');
await page.waitForTimeout(500);

// creep past the collapse threshold like a real scroll, then stop at ~56
const samples = await page.evaluate(async () => {
  const sc = document.querySelector("#root");
  const h1 = document.querySelector("h1");
  for (let y = 0; y <= 56; y += 8) {
    sc.scrollTop = y;
    await new Promise(r => setTimeout(r, 40));
  }
  // sample for 1.6s after stopping
  const out = [];
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 200));
    out.push({ t: i * 200, y: Math.round(sc.scrollTop), fs: getComputedStyle(h1).fontSize });
  }
  return out;
});
console.log(JSON.stringify(samples, null, 0));

const ys = samples.map(s => s.y);
const stable = Math.max(...ys) - Math.min(...ys) <= 1;
const finalFs = parseFloat(samples.at(-1).fs);
console.log(stable ? "SCROLL STABLE" : "SCROLL OSCILLATING!", "final font-size:", finalFs);
if (!stable) process.exitCode = 1;
if (finalFs > 32) { console.log("HEADER STILL EXPANDED (font too big)"); process.exitCode = 1; }

await page.screenshot({ path: `${OUT}/header-boundary.png` });
await browser.close();
console.log("DONE");
