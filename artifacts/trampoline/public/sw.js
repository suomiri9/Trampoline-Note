/* Trampoline Note offline service worker.
 * Pre-caches the navigation shell AND every built asset (route JS chunks,
 * CSS, fonts) so an installed PWA can launch — and reach every page — with
 * zero network. API requests are NOT intercepted — offline behaviour for
 * data is handled at the React layer. */

const CACHE = 'tn-shell-v12';

// Replaced at build time (offlineManifest in vite.config.ts) with the full list of built files
// under /assets/ plus /offline-manifest.json. Route chunks are lazy-loaded,
// so without precaching them a page never visited while online failed with
// "This page isn't available offline yet" even when Settings showed 100%.
// Stays empty in dev, where modules are served from /src/ instead.
const BUILD_ASSETS = [];

// How long a navigation waits on a slow network before falling back to the
// cached shell. Keeps the app openable on flaky/slow wifi (school wifi etc.)
// when offline mode has pre-cached the shell.
const NAV_TIMEOUT_MS = 3500;
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Phase 1 — built assets, BEFORE the shell is touched. Hashed /assets/
      // URLs are immutable, so copies already in a cache (runtime-cached, or
      // left by a previously failed install) are salvaged instead of
      // refetched — a retried install resumes where it stopped. Any failure
      // throws, aborting the install while the old service worker still
      // serves a coherent old app (old '/' + old chunks).
      await Promise.all(
        BUILD_ASSETS.map(async (url) => {
          const immutable = url.startsWith('/assets/');
          if (immutable) {
            if (await cache.match(url)) return;
            const prior = await caches.match(url);
            if (prior) {
              await cache.put(url, prior);
              return;
            }
          }
          const res = await fetch(
            url,
            immutable
              ? { credentials: 'same-origin' }
              : { cache: 'reload', credentials: 'same-origin' },
          );
          if (!res || !res.ok) throw new Error('asset precache failed: ' + url);
          await cache.put(url, res);
        }),
      );
      // Phase 2 — the navigation shell (unchanged salvage-or-abort rules).
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
            if (res && res.ok) {
              await cache.put(url, res);
              return;
            }
          } catch {
            // fall through
          }
          // '/' is the navigation shell — without it the app cannot open
          // offline at all. If it can't be fetched now (flaky wifi during an
          // update), salvage the previous version's copy instead of shipping
          // an empty shell cache.
          if (url === '/') {
            const prior = await caches.match('/');
            if (prior) {
              await cache.put('/', prior);
            } else {
              // No shell available at all — abort this install so the old
              // service worker (and its cache) stays in charge.
              throw new Error('shell precache failed');
            }
          }
        }),
      );
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Safety net: never delete old caches until the new one has a shell.
      const cache = await caches.open(CACHE);
      if (!(await cache.match('/'))) {
        const prior = await caches.match('/');
        if (prior) await cache.put('/', prior);
      }
      // Prune old builds' hashed assets from THIS cache (its name is stable
      // across deploys). Skipped when BUILD_ASSETS is empty (dev) so a
      // dev-served worker can never wipe a production preview's chunks on
      // the same origin.
      if (BUILD_ASSETS.length > 0) {
        const valid = new Set(BUILD_ASSETS);
        const reqs = await cache.keys();
        await Promise.all(
          reqs.map(async (req) => {
            const path = new URL(req.url).pathname;
            if (path.startsWith('/assets/') && !valid.has(path)) await cache.delete(req);
          }),
        );
      }
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isBypassed(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === '/sw.js') return true;
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return true;
  // Dev-server paths: never cache these. In dev, contents change behind a
  // stable URL, so stale-while-revalidate would pin users to old JS — and,
  // worst, would serve old code while offline so a deployed fix never reaches
  // them until they reload twice while online.
  if (url.pathname.startsWith('/src/')) return true;
  if (url.pathname.startsWith('/node_modules/')) return true;
  if (url.pathname.startsWith('/@vite') || url.pathname.startsWith('/@react') || url.pathname.startsWith('/@id/') || url.pathname.startsWith('/@fs/')) return true;
  if (url.pathname.startsWith('/vite-hmr') || url.pathname.startsWith('/__vite')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (isBypassed(url)) return;

  // Navigation requests: try network first, but if the network is slow
  // (no response within NAV_TIMEOUT_MS) or fails, fall back to the cached
  // shell so the app still opens on bad wifi. The network fetch keeps
  // running in the background to refresh the cached copy for next launch.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cachedShell = () =>
          caches.match('/').then((r) => r || caches.match('/index.html') || null);

        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
            }
            return res;
          });

        const timeout = new Promise((resolve) => {
          setTimeout(() => resolve('timeout'), NAV_TIMEOUT_MS);
        });

        const winner = await Promise.race([network.catch(() => 'error'), timeout]);
        if (winner !== 'timeout' && winner !== 'error') return winner;

        const cached = await cachedShell();
        if (cached) {
          // Let the slow network response land in the cache in the background.
          event.waitUntil(network.catch(() => {}));
          return cached;
        }
        // No cached shell — wait out the network after all.
        try {
          return await network;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed build assets are immutable — cache-first, filling the cache from
  // the network on a miss (covers anything the precache didn't know about).
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    // ignoreSearch: chunk-retry imports append ?retry=N to bust the module
    // map — the cached hashed asset must still match, or offline retries of
    // a precached chunk fail.
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Other same-origin files and cross-origin (Google Fonts, etc.):
  // stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (
            res &&
            res.status === 200 &&
            (res.type === 'basic' || res.type === 'cors')
          ) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
