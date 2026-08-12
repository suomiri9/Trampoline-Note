// Log Training Session dialog shots (header redesign check).
// Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/note-dialog-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const OUT = "/tmp/pageshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const email = `note-${Date.now()}@test.local`;
const reg = await page.evaluate(async (email) => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }) });
  return r.status;
}, email);
if (reg !== 201) throw new Error("register failed: " + reg);

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.click('[data-testid="btn-new-note"]');
await page.waitForSelector('[data-testid="tab-note-start"]');
await page.waitForTimeout(450);
await page.locator('div[role="dialog"]').first().screenshot({ path: `${OUT}/note-step1.png` });
console.log("shot note-step1");

await page.click('[data-testid="tab-note-finish"]');
await page.waitForTimeout(350);
await page.locator('div[role="dialog"]').first().screenshot({ path: `${OUT}/note-step3.png` });
console.log("shot note-step3");

await browser.close();
console.log("DONE");
