import { chromium } from 'playwright-core';
const BASE = 'https://' + process.env.REPLIT_DEV_DOMAIN;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
try {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  // find stats chunk url from the index bundle
  const idx = await page.evaluate(async () => {
    const src = document.querySelector('script[src*="/assets/index-"]').src;
    const txt = await (await fetch(src)).text();
    const m = /stats-[\w-]+\.js/.exec(txt);
    return m && m[0];
  });
  console.log('chunk:', idx);
  const r1 = await page.evaluate(u => import(u).then(() => 'ok', e => 'ERR: ' + e.message), '/assets/' + idx + '?retry=99');
  console.log('import with query:', r1);
  const r2 = await page.evaluate(u => fetch(u).then(r => r.status + ' ' + r.headers.get('content-type')), '/assets/' + idx + '?retry=99');
  console.log('fetch:', r2);
} catch (e) { console.log('ERR', e.message); }
await browser.close();
