import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
mkdirSync("/tmp/pageshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const reg = await page.evaluate(async () => (await fetch("/api/auth/register", { method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `ea-${Date.now()}@test.local`, password: "Test1234!" }) })).status);
if (reg !== 201) throw new Error("register failed");
await page.goto(BASE + "/execution", { waitUntil: "networkidle" });
const headerHasPhoto = await page.evaluate(() => {
  const hdr = document.querySelector(".page-header-safe");
  return !!hdr?.querySelector('[data-testid="button-upload-execution-photo"]');
});
await page.click('[data-testid="button-new-execution-session"]');
await page.waitForSelector('[data-testid="button-upload-execution-photo"]');
await page.waitForTimeout(400);
await page.locator('div[role="dialog"]').first().screenshot({ path: "/tmp/pageshots/exec-add.png" });
console.log("photo button still in header:", headerHasPhoto);
await browser.close();
console.log("DONE");
