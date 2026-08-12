import { chromium } from "playwright-core";
const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const reg = await page.evaluate(async () => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `focus-${Date.now()}@test.local`, password: "Test1234!" }) });
  await fetch("/api/auth/points-to-fix", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "p-focus-1", name: "Point toes", skillIds: [], routineIds: [], category: "General" }) });
  return r.status;
});
if (reg !== 201) throw new Error("register failed");
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.getByText("Points to Fix", { exact: true }).click();
await page.waitForSelector('[data-testid="badge-active-count"]');
await page.waitForTimeout(600);
const active = await page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName, testid: a?.getAttribute?.("data-testid"), type: a?.getAttribute?.("type") };
});
console.log("activeElement after open:", JSON.stringify(active));
console.log(active.tag === "INPUT" ? "FAIL: input focused" : "OK: no input focused");
await browser.close();
