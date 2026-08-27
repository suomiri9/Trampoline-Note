import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
mkdirSync("/tmp/pageshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const reg = await page.evaluate(async () => (await fetch("/api/auth/register", { method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `led-${Date.now()}@test.local`, password: "Test1234!" }) })).status);
if (reg !== 201) throw new Error("register failed");
const seed = await page.evaluate(async () => {
  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch {}
    return { s: r.status, id: j?.id, j };
  };
  const SKILLS = [
    ["Back Tuck", "40o", 0.5], ["Barani", "41o", 0.6], ["Full", "43/", 0.7],
    ["Rudi", "45/", 0.9], ["Cody", "31o", 0.6], ["Double Back", "804o", 1.0],
    ["Half Out", "801<", 1.1], ["Full In", "813o", 1.2], ["Lazy Back", "40/", 0.6],
    ["Randy", "47/", 1.1],
  ];
  const ids = [];
  for (const [name, code, difficulty] of SKILLS) {
    const r = await post("/api/skills", { name, code, difficulty, isDrill: 0 });
    if (r.id) ids.push(r.id);
  }
  const rt = await post("/api/routines", { name: "Voluntary A", code: "VOL", skillIds: ids.slice(0, 10) });
  const d = (off) => { const t = new Date(Date.now() - off * 864e5); return t.toISOString().slice(0, 10); };
  // two sheets: totals ~4.3 and ~5.0 → avg ~4.65, best 4.3 → cleanest E 15.7
  const e1 = await post("/api/execution-sessions", { date: d(1), routineId: rt.id, category: "vol",
    deductions: [0.4, 0.5, 0.3, 0.6, 0.4, 0.5, 0.3, 0.4, 0.5, 0.2], landingDeduction: 0.2 });
  const e2 = await post("/api/execution-sessions", { date: d(0), routineId: rt.id, category: "vol",
    deductions: [0.5, 0.6, 0.4, 0.7, 0.5, 0.6, 0.4, 0.5, 0.5, 0.3], landingDeduction: 0 });
  return [rt.s, e1.s, e2.s];
});
console.log("seed", seed);
await page.goto(BASE + "/execution", { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="panel-exec-scorecard"]');
await page.waitForTimeout(2800);
await page.locator('[data-testid="panel-exec-scorecard"]').screenshot({ path: "/tmp/pageshots/exec-ledger-mobile.png" });
// desktop width too
const page2 = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, storageState: await page.context().storageState() })).newPage();
await page2.goto(BASE + "/execution", { waitUntil: "networkidle" });
await page2.waitForSelector('[data-testid="panel-exec-scorecard"]');
await page2.waitForTimeout(2800);
await page2.locator('[data-testid="panel-exec-scorecard"]').screenshot({ path: "/tmp/pageshots/exec-ledger-desktop.png" });
await browser.close();
console.log("DONE");
