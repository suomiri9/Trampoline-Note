// Targeted shot: debuts page header (back-button removal check).
// Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/debuts-shot.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const OUT = "/tmp/pageshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const email = `debuts-shot-${Date.now()}@test.local`;
const reg = await page.evaluate(async (email) => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }) });
  return r.status;
}, email);
if (reg !== 201) throw new Error("register failed: " + reg);

await page.goto(BASE + "/score/debuts", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/debuts-desktop.png`, fullPage: false });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/debuts-mobile.png`, fullPage: false });
await browser.close();
console.log("DONE");
