// Tight high-dpr shots of the gradient headline words to verify descender paint.
import { chromium } from "playwright-core";
const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const email = `descender-${Date.now()}@test.local`;
const r = await p.evaluate(async (email) => (await fetch("/api/auth/register", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Test1234!" }) })).status, email);
if (r !== 201) throw new Error("register " + r);
for (const [route, name] of [["/stats", "desc-stats"], ["/routines", "desc-routines"], ["/", "desc-home"]]) {
  await p.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => {});
  await p.waitForTimeout(1800);
  const h1 = p.locator("h1").first();
  await h1.screenshot({ path: `/tmp/pageshots/${name}.png` }).catch(e => console.log(name, "fail", e.message));
  console.log("shot", name);
}
await browser.close();
console.log("done");
