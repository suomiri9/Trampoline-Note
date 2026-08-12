import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
mkdirSync("/tmp/pageshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const reg = await page.evaluate(async () => (await fetch("/api/auth/register", { method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `sa-${Date.now()}@test.local`, password: "Test1234!" }) })).status);
if (reg !== 201) throw new Error("register failed");
await page.goto(BASE + "/score", { waitUntil: "networkidle" });
await page.click('[data-testid="button-add-score"]');
await page.waitForSelector('[data-testid="button-upload-scoresheet"]');
await page.waitForTimeout(400);
await page.locator('div[role="dialog"]').first().screenshot({ path: "/tmp/pageshots/score-add.png" });
const headerHasPhoto = await page.evaluate(() => !!document.querySelector('header [data-testid="button-upload-scoresheet"], .page-header-safe [data-testid="button-upload-scoresheet"]'));
console.log("photo button still in header:", headerHasPhoto);
await browser.close();
console.log("DONE");
