// Targeted shots: the app-wide BackLink scheme on every subpage that has one.
// Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/backlink-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const OUT = "/tmp/pageshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const email = `backlink-${Date.now()}@test.local`;
const reg = await page.evaluate(async (email) => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }) });
  return r.status;
}, email);
if (reg !== 201) throw new Error("register failed: " + reg);

const seed = await page.evaluate(async () => {
  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch {}
    return { s: r.status, id: j?.id };
  };
  const SKILLS = [
    ["Half Out", "801<", 1.1], ["Lazy Back", "40/", 0.6], ["Half In Half Out", "801o", 1.2],
    ["Double Back", "800o", 1.0], ["Barani", "41/", 0.6], ["Back Tuck", "40<", 0.5],
    ["Barani Ball", "41<", 0.6], ["Back Pike", "40o", 0.5], ["Barani Tuck", "41o", 0.6],
    ["Double Pike", "800<", 1.0],
  ];
  const ids = [];
  for (const [name, code, difficulty] of SKILLS) {
    const r = await post("/api/skills", { name, code, difficulty, isDrill: 0 });
    if (r.id) ids.push(r.id);
  }
  const rt = await post("/api/routines", { name: "4 Doubles", code: "4D", skillIds: ids });
  const today = new Date().toISOString().slice(0, 10);
  const tof = await post("/api/tof-sessions", { date: today, routineId: rt.id,
    tofValues: [1.72, 1.68, 1.75, 1.7, 1.66, 1.73, 1.69, 1.71, 1.64, 1.7], preJumpTof: 1.76 });
  const exec = await post("/api/execution-sessions", { date: today, routineId: rt.id,
    deductions: [1, 2, 1, 3, 2, 1, 2, 1, 3, 2] });
  return { skill: ids[0], routine: rt.id, tof: tof.id, exec: exec.id, execStatus: exec.s };
});
console.log("seeded:", JSON.stringify(seed));

const shots = [
  [`/routines/${seed.routine}`, "bl-routine-detail"],
  [`/skills/${seed.skill}`, "bl-skill-detail"],
  [`/tof/session/${seed.tof}`, "bl-tof-session"],
  [`/tof/routine/${seed.routine}`, "bl-tof-routine"],
  [`/execution/routine/${seed.routine}`, "bl-execution-routine"],
  ["/score/debuts", "bl-debuts"],
];
for (const [path, name] of shots) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("shot", name, path);
}
await browser.close();
console.log("DONE");
