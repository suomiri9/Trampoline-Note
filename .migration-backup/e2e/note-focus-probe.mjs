// Where does focus land after "Add Note" on a skill row in the training log?
// Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/note-focus-probe.mjs
import { chromium } from "playwright-core";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const reg = await page.evaluate(async () => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `nf-${Date.now()}@test.local`, password: "Test1234!" }) });
  // one skill so step 2 has a row to hang a note on
  await fetch("/api/skills", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Half Out", code: "801<", difficulty: 1.1, isDrill: 0 }) });
  return r.status;
});
if (reg !== 201) throw new Error("register failed");

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.click('[data-testid="btn-new-note"]');
await page.waitForSelector('[data-testid="tab-note-start"]');
await page.click('[data-testid="btn-note-next"]');
await page.waitForTimeout(300);

// add the skill via the picker
await page.click('[data-testid="btn-open-picker"]');
await page.waitForTimeout(250);
await page.keyboard.type("Half");
await page.waitForTimeout(400);
await page.getByText("Half Out", { exact: false }).first().click();
await page.waitForTimeout(400);

// open the row's ⋮ menu and hit Add Note
const kebabs = page.locator('div[role="dialog"] button:has(svg.lucide-ellipsis-vertical)');
await kebabs.last().click();
await page.waitForTimeout(250);
await page.getByRole("menuitem", { name: /add note/i }).click();

// sample activeElement over time
for (const wait of [100, 300, 600, 1000]) {
  await page.waitForTimeout(wait === 100 ? 100 : wait - (wait === 300 ? 100 : wait === 600 ? 300 : 600));
  const a = await page.evaluate(() => {
    const el = document.activeElement;
    return { t: el?.tagName, testid: el?.getAttribute?.("data-testid"), ph: el?.getAttribute?.("placeholder") };
  });
  console.log(`t=${wait}ms`, JSON.stringify(a));
}
await browser.close();
console.log("DONE");
