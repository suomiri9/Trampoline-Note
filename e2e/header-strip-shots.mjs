import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
mkdirSync("/tmp/pageshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const reg = await page.evaluate(async () => (await fetch("/api/auth/register", { method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `hs-${Date.now()}@test.local`, password: "Test1234!" }) })).status);
if (reg !== 201) throw new Error("register failed");
const shot = async (path, name) => {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/pageshots/${name}.png`, clip: { x: 0, y: 0, width: 430, height: 360 } });
  console.log("shot", name);
};
await shot("/score/debuts", "hdr-debuts");
await shot("/score", "hdr-score");
await shot("/skills", "hdr-skills");
await browser.close();
console.log("DONE");
