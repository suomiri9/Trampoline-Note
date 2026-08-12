// Page-gallery shots for design review: registers a throwaway user, seeds
// representative data through the app's own APIs, then captures full-page
// screenshots of every page (mobile + key desktop) into /tmp/pageshots/.
// Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/pages-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const OUT = "/tmp/pageshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true, isMobile: true, deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const email = `motion-e2e-shots-${Date.now()}@test.local`;
const reg = await page.evaluate(async (email) => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }) });
  return r.status;
}, email);
if (reg !== 201) throw new Error("register failed: " + reg);
console.log("registered", email);

// ---- seed through the app's own APIs (session cookie) ----
const seed = await page.evaluate(async () => {
  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch {}
    return { s: r.status, id: j?.id, j };
  };
  const log = [];
  const SKILLS = [
    ["Back Tuck", "40o", 0.5], ["Barani", "41o", 0.6], ["Full", "43/", 0.7],
    ["Rudi", "45/", 0.9], ["Cody", "31o", 0.6], ["Double Back", "804o", 1.0],
    ["Half Out", "801<", 1.1], ["Full In", "813o", 1.2], ["Lazy Back", "40/", 0.6],
    ["Randy", "47/", 1.1],
  ];
  const ids = [];
  for (const [name, code, difficulty] of SKILLS) {
    const r = await post("/api/skills", { name, code, difficulty, isDrill: 0 });
    log.push(["skill", name, r.s]); if (r.id) ids.push(r.id);
  }
  const rt = await post("/api/routines", { name: "Voluntary A", code: "VOL", skillIds: ids.slice(0, 10) });
  log.push(["routine", rt.s, rt.id]);
  const d = (off) => { const t = new Date(Date.now() - off * 864e5); return t.toISOString().slice(0, 10); };
  const n1 = await post("/api/notes", { date: d(0), startTime: "16:00", endTime: "18:00", rating: 4,
    content: "Solid session. Voluntary A twice through, double back felt clean.",
    skills: JSON.stringify([{ id: ids[5], reps: 6 }, { id: ids[1], reps: 8 }]) });
  const n2 = await post("/api/notes", { date: d(1), startTime: "17:00", endTime: "19:00", rating: 3,
    content: "Rudi timing off early, better after drills.",
    skills: JSON.stringify([{ id: ids[3], reps: 10 }]) });
  log.push(["notes", n1.s, n2.s]);
  const tof = await post("/api/tof-sessions", { date: d(0), routineId: rt.id,
    tofValues: [1.72, 1.68, 1.75, 1.7, 1.66, 1.73, 1.69, 1.71, 1.64, 1.7], preJumpTof: 1.76 });
  log.push(["tof", tof.s, tof.id]);
  const ex = await post("/api/execution-sessions", { date: d(0), routineId: rt.id, category: "vol",
    deductions: [0.1, 0.2, 0, 0.1, 0.2, 0.1, 0, 0.2, 0.1, 0.3], landingDeduction: 0.2 });
  log.push(["exec", ex.s, ex.id]);
  return { log, skillId: ids[0], routineId: rt.id, tofId: tof.id, execId: ex.id };
});
console.log("seed:", JSON.stringify(seed.log));

const shoot = async (p, route, name) => {
  await p.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => {});
  await p.waitForFunction(() => {
    const cands = document.querySelectorAll('#splash,[id*="splash"],[class*="splash"]');
    for (const el of cands) {
      const cs = getComputedStyle(el);
      if (cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05 && el.getBoundingClientRect().height > 100) return false;
    }
    return true;
  }, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${name}.jpg`, fullPage: true, type: "jpeg", quality: 55 });
  console.log("shot", name);
};

const M = [
  ["/", "m-home"], ["/skills", "m-skills"], [`/skills/${seed.skillId}`, "m-skill-detail"],
  ["/routines", "m-routines"], [`/routines/${seed.routineId}`, "m-routine-detail"],
  ["/stats", "m-stats"], ["/score", "m-score"],
  ["/tof", "m-tof"], [`/tof/session/${seed.tofId}`, "m-tof-session"],
  ["/execution", "m-execution"], [`/execution/session/${seed.execId}`, "m-exec-session"],
  ["/whoop", "m-whoop"], ["/coach", "m-coach"], ["/settings", "m-settings"],
];
for (const [r, n] of M) await shoot(page, r, n);

const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const dp = await dctx.newPage();
await dp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await dp.evaluate(async (email) => {
  await fetch("/api/auth/login", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }) });
}, email);
for (const [r, n] of [["/skills", "d-skills"], ["/routines", "d-routines"], ["/tof", "d-tof"], ["/execution", "d-execution"], ["/settings", "d-settings"]])
  await shoot(dp, r, n);

await browser.close();
console.log("DONE -> " + OUT);
