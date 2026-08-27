import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
mkdirSync("/tmp/pageshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const reg = await page.evaluate(async () => (await fetch("/api/auth/register", { method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `hero-${Date.now()}@test.local`, password: "Test1234!" }) })).status);
if (reg !== 201) throw new Error("register failed");
const shot = async (path, openSel, name, closeAfter = true) => {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.click(openSel);
  await page.waitForSelector('div[role="dialog"]');
  await page.waitForTimeout(450);
  await page.locator('div[role="dialog"]').first().screenshot({ path: `/tmp/pageshots/${name}.png` });
  if (closeAfter) await page.keyboard.press("Escape");
  console.log("shot", name);
};
await shot("/skills", '[data-testid="button-add-skill"]', "hero-skill");
await shot("/tof", '[data-testid="button-new-tof-empty"]', "hero-tof");
await shot("/routines", '[data-testid="button-new-routine-empty"]', "hero-routine");
await browser.close();
console.log("DONE");
