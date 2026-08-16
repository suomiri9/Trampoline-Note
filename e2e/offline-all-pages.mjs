// Real-browser regression test: after a full offline download, EVERY page
// must open with the network off.
//
// Flow: register a throwaway account online → enable Offline mode in
// Settings → wait for the download card to reach 100% (and assert the
// "App ready to launch offline" row only shows ✓ when the shell + chunks
// are truly cached) → switch the browser context offline → visit every
// route in client/src/App.tsx and assert none shows the
// "This page isn't available offline yet" recovery screen (or a blank app).
//
// Prerequisites:
// - The PRODUCTION build must be serving (workflow "Start application"),
//   so /sw.js has the injected BUILD_ASSETS list and /offline-manifest.json
//   exists.
// - Headless Chromium shell: `npx playwright-core install chromium`.
// Run with:
//   LD_LIBRARY_PATH=$(echo /nix/store/*-glib-*/lib | tr ' ' ':') \
//     node e2e/offline-all-pages.mjs
// Uses https://$REPLIT_DEV_DOMAIN (the session cookie is Secure-only, so
// plain-http localhost silently fails auth).

import { chromium } from "playwright-core";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const ROUTES = [
  "/",
  "/score",
  "/score/debuts",
  "/stats",
  "/skills",
  "/routines",
  "/whoop",
  "/coach",
  "/tof",
  "/execution",
  "/settings",
  "/privacy",
];

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error("FAIL:", msg);
};
const ok = (msg) => console.log("ok:", msg);

// CHROME_BIN: use a system chromium (e.g. from /nix/store) instead of the
// playwright-managed download, which isn't always installed in this env.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN
    ? {
        executablePath: process.env.CHROME_BIN,
        args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      }
    : {}),
});
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  // 1. Register a throwaway account (register logs the session in).
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const email = `offline-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const reg = await page.evaluate(async (email) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Test1234!" }),
    });
    return res.status;
  }, email);
  if (reg !== 201) throw new Error(`register failed: HTTP ${reg}`);
  ok(`registered ${email}`);

  // 2. Open Settings and enable Offline mode.
  await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
  const toggle = page.getByTestId("toggle-offline-mode");
  await toggle.waitFor({ timeout: 15000 });
  if ((await toggle.getAttribute("data-state")) !== "checked") {
    await toggle.click();
  }
  ok("offline mode enabled");

  // 3. Wait for 100%, and along the way assert the "App ready to launch
  //    offline" row only shows ✓ when the SW cache truly holds the chunks.
  const readyRowTrulyCached = async () => {
    // ✓ is the CheckCircle2 svg (has a circle path); CircleDashed differs.
    const rowReady = await page.evaluate(() => {
      const row = document.querySelector('[data-testid="status-app-shell"]');
      if (!row) return null;
      // Ready rows render the emerald CheckCircle2 icon.
      return !!row.querySelector("svg.text-emerald-600, svg.lucide-circle-check-big, svg.lucide-check-circle-2");
    });
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const shell = keys.filter((k) => /^tn-shell-v\d+$/.test(k)).sort().pop();
      if (!shell) return { total: 0, cached: 0 };
      const manifest = await (await fetch("/offline-manifest.json")).json();
      const cache = await caches.open(shell);
      const paths = new Set(
        (await cache.keys()).map((r) => new URL(r.url).pathname),
      );
      const urls = ["/", ...manifest.urls];
      return { total: urls.length, cached: urls.filter((u) => paths.has(u)).length };
    });
    return { rowReady, cached };
  };

  let done = false;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const pct = await page
      .getByTestId("text-download-percent")
      .textContent()
      .catch(() => null);
    const { rowReady, cached } = await readyRowTrulyCached();
    // Invariant: the ✓ must never show while chunks are missing from cache.
    if (rowReady && cached.cached < cached.total) {
      fail(
        `"App ready to launch offline" shows ✓ but only ${cached.cached}/${cached.total} files cached`,
      );
    }
    if (pct && pct.trim().startsWith("100%")) {
      if (!rowReady) fail("100% but app-shell row shows no ✓");
      if (cached.cached < cached.total)
        fail(`100% but only ${cached.cached}/${cached.total} files in SW cache`);
      else ok(`download 100% — ${cached.cached}/${cached.total} files cached, row shows ✓`);
      done = true;
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (!done) throw new Error("download never reached 100% within 120s");

  // 4. Go offline and visit every route.
  await ctx.setOffline(true);
  ok("browser context is now offline");

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    // Give lazy chunks + suspense a moment to settle.
    await page.waitForTimeout(1500);
    const recovery = await page
      .getByTestId("card-chunk-offline")
      .count();
    const bodyText = ((await page.textContent("body")) || "").trim();
    if (recovery > 0) fail(`${route}: shows the offline recovery screen`);
    else if (bodyText.length < 10) fail(`${route}: page is blank offline`);
    else ok(`${route} renders offline`);
  }

  await ctx.setOffline(false);
} catch (err) {
  fail(String(err && err.message ? err.message : err));
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll offline route checks passed.");
process.exit(0);
