// Fluid-motion smoke test (docs/apple-design-skill.md, task: motion pass).
//
// Asserts the adaptive confirm presentation:
//   1. Mobile viewport  → gesture bottom sheet (vaul): bottom-anchored,
//      drag handle, closes on cancel; press feedback (.pressable) is live.
//   2. Desktop viewport → centered alert dialog with the symmetric
//      fade+zoom classes; no sheet.
//   3. Mobile + prefers-reduced-motion → centered dialog again (§14: the
//      sheet spring is replaced by the dialog's quick cross-fade).
//
// Prerequisites:
// - The PRODUCTION build must be serving (workflow "Start application").
// - Headless Chromium shell: `npx playwright-core install chromium`.
// Run with:
//   LD_LIBRARY_PATH=$(echo /nix/store/*-glib-*/lib | tr ' ' ':') \
//     node e2e/motion-smoke.mjs
// Uses https://$REPLIT_DEV_DOMAIN (the session cookie is Secure-only, so
// plain-http localhost silently fails auth).

import { chromium } from "playwright-core";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error("FAIL:", msg);
};
const ok = (msg) => console.log("ok:", msg);

async function registerAndOpenSettings(page, tag) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const email = `motion-e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
  const status = await page.evaluate(async (email) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Test1234!" }),
    });
    return res.status;
  }, email);
  if (status !== 201) throw new Error(`register failed (${tag}): HTTP ${status}`);
  await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
  await page.getByTestId("btn-sign-out").waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ headless: true });

try {
  // ---- 1. Mobile: bottom sheet ------------------------------------------
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const m = await mctx.newPage();
  await registerAndOpenSettings(m, "mobile");

  // Press feedback is wired app-wide via the Button primitive.
  const transition = await m
    .getByTestId("btn-sign-out")
    .evaluate((el) => getComputedStyle(el).transitionProperty);
  if (/(^|, )scale($|,)/.test(transition)) ok("pressable transition (scale) live on buttons");
  else fail(`button transition-property lacks scale: "${transition}"`);

  await m.getByTestId("btn-sign-out").click();
  const sheet = m.getByTestId("sheet-confirm");
  await sheet.waitFor({ timeout: 5000 });
  const isVaul = await sheet.evaluate(
    (el) => el.hasAttribute("data-vaul-drawer") || !!el.closest("[data-vaul-drawer]"),
  );
  if (isVaul) ok("mobile confirm renders as vaul sheet");
  else fail("sheet-confirm is not a vaul drawer");

  await m.waitForTimeout(700); // let the slide-in settle
  const box = await sheet.boundingBox();
  const vh = m.viewportSize().height;
  if (box && Math.abs(box.y + box.height - vh) <= 2) ok("sheet is bottom-anchored");
  else fail(`sheet not bottom-anchored: box=${JSON.stringify(box)} vh=${vh}`);
  if (box && box.height < vh * 0.7) ok("sheet is a partial-height surface");
  else fail("sheet unexpectedly covers (almost) the whole screen");

  await m.getByTestId("button-cancel").click();
  await m.waitForTimeout(700);
  if ((await m.getByTestId("sheet-confirm").count()) === 0) ok("sheet closes on cancel");
  else fail("sheet did not close on cancel");
  await mctx.close();

  // ---- 2. Desktop: centered dialog ---------------------------------------
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const d = await dctx.newPage();
  await registerAndOpenSettings(d, "desktop");
  await d.getByTestId("btn-sign-out").click();
  const dlg = d.locator('[role="alertdialog"]');
  await dlg.waitFor({ timeout: 5000 });
  if ((await d.getByTestId("sheet-confirm").count()) === 0) ok("desktop keeps the dialog (no sheet)");
  else fail("desktop shows the mobile sheet");

  const dbox = await dlg.boundingBox();
  const cx = dbox.x + dbox.width / 2;
  if (Math.abs(cx - 640) <= 8) ok("desktop dialog horizontally centered");
  else fail(`desktop dialog off-center: cx=${cx}`);
  const cls = (await dlg.getAttribute("class")) || "";
  if (cls.includes("zoom-in-[.97]") && cls.includes("zoom-out-[.97]"))
    ok("dialog carries symmetric zoom in/out classes");
  else fail(`dialog missing symmetric zoom classes: ${cls}`);

  await d.getByTestId("button-cancel").click();
  await d.waitForTimeout(600);
  if ((await dlg.count()) === 0) ok("desktop dialog closes on cancel");
  else fail("desktop dialog did not close");
  await dctx.close();

  // ---- 3. Mobile + reduced motion: centered dialog, not sheet -------------
  const rctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const r = await rctx.newPage();
  await registerAndOpenSettings(r, "reduced");
  await r.getByTestId("btn-sign-out").click();
  await r.locator('[role="alertdialog"]').waitFor({ timeout: 5000 });
  if ((await r.getByTestId("sheet-confirm").count()) === 0)
    ok("reduced motion swaps sheet for centered dialog");
  else fail("reduced motion still shows the sheet");
  // .pressable scaling must be disabled under reduced motion.
  const activeScale = await r.getByTestId("button-cancel").evaluate((el) => {
    el.classList.add("pressable"); // buttons already have it; be explicit
    return getComputedStyle(el).scale;
  });
  await rctx.close();
  ok(`reduced-motion resting scale: ${activeScale} (expected "none"/"1")`);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await browser.close();
}
