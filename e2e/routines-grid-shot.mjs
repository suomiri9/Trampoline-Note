// Targeted shot: routines lineup grid density check (1 / 2 / 3 per row).
// Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/routines-grid-shot.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const OUT = "/tmp/pageshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const email = `routines-grid-${Date.now()}@test.local`;
const reg = await page.evaluate(async (email) => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }) });
  return r.status;
}, email);
if (reg !== 201) throw new Error("register failed: " + reg);

const seed = await page.evaluate(async () => {
  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch {}
    return { s: r.status, id: j?.id };
  };
  const SKILLS = [
    ["Half Out", "801<", 1.1], ["Lazy Back", "40/", 0.6], ["Half In Half Out", "801o", 1.2],
    ["Double Back", "800o", 1.0], ["Barani", "41/", 0.6], ["Back Tuck", "40<", 0.5],
    ["Barani Ball", "41<", 0.6], ["Back Pike", "40o", 0.5], ["Barani Tuck", "41o", 0.6],
    ["Double Pike", "800<", 1.0],
  ];
  const ids = [];
  for (const [name, code, difficulty] of SKILLS) {
    const r = await post("/api/skills", { name, code, difficulty, isDrill: 0 });
    if (r.id) ids.push(r.id);
  }
  const r1 = await post("/api/routines", { name: "4 Doubles", code: "4D", skillIds: ids });
  const r2 = await post("/api/routines", { name: "Set", code: "SET", skillIds: ids.slice(0, 10).reverse() });
  const r3 = await post("/api/routines", { name: "Voluntary", code: "VOL", skillIds: ids.slice(0, 10) });
  return [r1.s, r2.s, r3.s];
});
console.log("seeded routines:", seed);

for (const [w, h, name] of [[1280, 900, "routines-lg-3col"], [820, 900, "routines-sm-2col"], [390, 844, "routines-mobile-1col"]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE + "/routines", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("shot", name);
}
await browser.close();
console.log("DONE");
