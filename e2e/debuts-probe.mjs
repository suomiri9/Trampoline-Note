import { chromium } from "playwright-core";
const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
page.on("console", m => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 300)); });
page.on("pageerror", e => console.log("PAGE-ERR:", String(e).slice(0, 400)));
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.evaluate(async () => (await fetch("/api/auth/register", { method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `dp-${Date.now()}@test.local`, password: "Test1234!" }) })).status);
await page.goto(BASE + "/debuts", { waitUntil: "networkidle" });
for (const t of [1000, 2500, 4500]) {
  await page.waitForTimeout(t === 1000 ? 1000 : 1500);
  const state = await page.evaluate(() => ({
    splash: !!document.getElementById("boot-splash"),
    header: !!document.querySelector(".page-header-safe"),
    body: document.body.innerText.slice(0, 80).replace(/\n/g, " | "),
  }));
  console.log(`t=${t}`, JSON.stringify(state));
}
await page.screenshot({ path: "/tmp/pageshots/hdr-debuts2.png", clip: { x: 0, y: 0, width: 430, height: 360 } });
await browser.close();
console.log("DONE");
