// Stats page: verify period+range bar stays pinned under the header while scrolling.
// Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/stats-sticky-shot.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const OUT = "/tmp/pageshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const email = `sticky-${Date.now()}@test.local`;
const reg = await page.evaluate(async (email) => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }) });
  return r.status;
}, email);
if (reg !== 201) throw new Error("register failed: " + reg);

// seed: skills + a routine + notes across several days so charts/history give scroll depth
const seed = await page.evaluate(async () => {
  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch {}
    return j;
  };
  const s1 = await post("/api/skills", { name: "Half Out", code: "801<", difficulty: 1.1, isDrill: 0 });
  const s2 = await post("/api/skills", { name: "Barani", code: "41/", difficulty: 0.6, isDrill: 0 });
  const mkSkills = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: i % 2 ? s1.id : s2.id, turns: 3 })));
  const days = [0, 1, 2, 3, 5, 7, 9, 12, 20, 40];
  for (const d of days) {
    const date = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    await post("/api/notes", { date, content: `Session ${d} days ago`, skills: mkSkills(4), rating: 4 });
  }
  return { ok: true };
});
console.log("seeded:", JSON.stringify(seed));

await page.goto(BASE + "/stats", { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="range-week"]');
await page.waitForTimeout(600);

// scroll the app scroll container (#root)
await page.evaluate(() => {
  const sc = document.querySelector("#root");
  sc.scrollTo({ top: 900, behavior: "instant" });
});
await page.waitForTimeout(500);
const vis = await page.evaluate(() => {
  const bar = document.querySelector('[data-testid="range-week"]').closest("div.sticky");
  const r = bar.getBoundingClientRect();
  const sc = document.querySelector("#root");
  return { top: Math.round(r.top), scrollTop: sc.scrollTop, sticky: !!bar };
});
console.log("after scroll:", JSON.stringify(vis));
await page.screenshot({ path: `${OUT}/stats-scrolled.png` });
console.log("shot stats-scrolled");
await browser.close();
console.log("DONE");
