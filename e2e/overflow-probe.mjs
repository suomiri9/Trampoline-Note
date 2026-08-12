// Probe /stats (and home) for horizontal overflow / clipped header text at
// several phone widths. Run: LD_LIBRARY_PATH=$(cat /tmp/pw-ldpath) node e2e/overflow-probe.mjs
import { chromium } from "playwright-core";
const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const browser = await chromium.launch({ headless: true });

const boot = await browser.newContext({ viewport: { width: 390, height: 844 } });
const bp = await boot.newPage();
await bp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const email = `overflow-probe-${Date.now()}@test.local`;
const reg = await bp.evaluate(async (email) => {
  const r = await fetch("/api/auth/register", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234!" }) });
  return r.status;
}, email);
if (reg !== 201) throw new Error("register failed " + reg);
await bp.evaluate(async () => {
  const d = (off) => new Date(Date.now() - off * 864e5).toISOString().slice(0, 10);
  for (const [off, rating] of [[0, 4], [1, 3], [3, 5]])
    await fetch("/api/notes", { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: d(off), startTime: "16:00", endTime: "18:00", rating, content: "probe session " + off }) });
});
const state = await boot.storageState();
await boot.close();

const inspect = async (p) => p.evaluate(() => {
  const vw = window.innerWidth;
  const root = document.getElementById("root");
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" && r.width <= vw + 2) continue;
      offenders.push({ tag: el.tagName.toLowerCase(), cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 90), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
    }
  }
  offenders.sort((a, b) => b.w - a.w);
  const h1 = document.querySelector("h1");
  const h1r = h1?.getBoundingClientRect();
  const sub = [...document.querySelectorAll("p")].find(x => x.textContent.includes("session trends"));
  const subr = sub?.getBoundingClientRect();
  return {
    vw, rootScrollW: root.scrollWidth, rootClientW: root.clientWidth, rootScrollLeft: root.scrollLeft,
    h1: h1r && { left: Math.round(h1r.left), right: Math.round(h1r.right), text: h1.textContent.slice(0, 30) },
    sub: subr && { left: Math.round(subr.left), right: Math.round(subr.right) },
    offenders: offenders.slice(0, 6),
  };
});

for (const width of [260, 320, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, storageState: state });
  const p = await ctx.newPage();
  await p.goto(BASE + "/stats", { waitUntil: "networkidle" }).catch(() => {});
  await p.waitForTimeout(2500);
  const top = await inspect(p);
  console.log(`\n=== /stats @ ${width}px TOP:`, JSON.stringify(top));
  await p.screenshot({ path: `/tmp/pageshots/probe-stats-${width}.jpg`, type: "jpeg", quality: 60 });
  // collapsed state
  await p.evaluate(() => { document.getElementById("root").scrollTop = 300; });
  await p.waitForTimeout(600);
  const mid = await inspect(p);
  console.log(`=== /stats @ ${width}px SCROLLED:`, JSON.stringify({ rootScrollLeft: mid.rootScrollLeft, h1: mid.h1, offenders: mid.offenders.slice(0, 3) }));
  
  await ctx.close();
}
await browser.close();
console.log("\nprobe done");
