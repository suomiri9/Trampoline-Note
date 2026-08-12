// Points to Fix dialog shots (redesign check).
// Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/ptf-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const OUT = "/tmp/pageshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function newUser(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const email = `ptf-${tag}-${Date.now()}@test.local`;
  const reg = await page.evaluate(async (email) => {
    const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Test1234!" }) });
    return r.status;
  }, email);
  if (reg !== 201) throw new Error("register failed: " + reg);
  return { ctx, page };
}

// --- user A: populated dialog ---
const { ctx: ctxA, page } = await newUser("a");
const seed = await page.evaluate(async () => {
  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch {}
    return { s: r.status, j };
  };
  const s1 = (await post("/api/skills", { name: "Half Out", code: "801<", difficulty: 1.1, isDrill: 0 })).j;
  const s2 = (await post("/api/skills", { name: "Barani", code: "41/", difficulty: 0.6, isDrill: 0 })).j;
  const rt = (await post("/api/routines", { name: "4 Doubles", code: "4D", skillIds: [s1.id, s2.id] })).j;
  const mk = (name, extra) => ({
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name, skillIds: [], routineIds: [], ...extra,
  });
  const pts = [
    mk("Kick out earlier from the half out", { skillIds: [s1.id] }),
    mk("Hold the twist shape all the way round", { skillIds: [s1.id] }),
    mk("Set higher before the barani", { skillIds: [s2.id] }),
    mk("Tighter arms on every takeoff", { routineIds: [rt.id] }),
    mk("Point toes on every landing", { category: "General" }),
    mk("Stop travelling backwards mid-routine", { category: "Backward" }),
  ];
  for (const p of pts) await post("/api/auth/points-to-fix", p);
  // mark one resolved
  const user = await (await fetch("/api/auth/user", { credentials: "include" })).json();
  const list = JSON.parse(user.focusMemo);
  const base = JSON.stringify(list);
  list[list.length - 2].resolved = true; // "Point toes..."
  const patch = await fetch("/api/auth/focus-memo", { method: "PATCH", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ focusMemo: JSON.stringify(list), baseFocusMemo: base }) });
  return { skills: [s1.id, s2.id], routine: rt.id, patch: patch.status, count: list.length };
});
console.log("seeded:", JSON.stringify(seed));

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.getByText("Points to Fix", { exact: true }).click();
await page.waitForSelector('[data-testid="badge-active-count"]');
await page.waitForTimeout(400);
// show resolved too
await page.click('[data-testid="button-toggle-resolved"]');
await page.waitForTimeout(400);
await page.locator('div[role="dialog"]').first().screenshot({ path: `${OUT}/ptf-main.png` });
console.log("shot ptf-main");

await page.click('[data-testid="button-open-add-point"]');
await page.waitForSelector('[data-testid="input-point-name"]');
await page.waitForTimeout(400);
await page.locator('div[role="dialog"]').last().screenshot({ path: `${OUT}/ptf-add.png` });
console.log("shot ptf-add");
await ctxA.close();

// --- user B: empty state ---
const { ctx: ctxB, page: pageB } = await newUser("b");
await pageB.goto(BASE + "/", { waitUntil: "networkidle" });
await pageB.getByText("Points to Fix", { exact: true }).click();
await pageB.waitForSelector('[data-testid="button-open-add-point-empty"]');
await pageB.waitForTimeout(400);
await pageB.locator('div[role="dialog"]').first().screenshot({ path: `${OUT}/ptf-empty.png` });
console.log("shot ptf-empty");
// empty CTA must open the add dialog now that it lives at fragment level
await pageB.click('[data-testid="button-open-add-point-empty"]');
await pageB.waitForSelector('[data-testid="input-point-name"]');
console.log("empty-state CTA opens add dialog: OK");
await ctxB.close();

await browser.close();
console.log("DONE");
