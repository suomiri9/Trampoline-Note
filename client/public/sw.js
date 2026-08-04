/* Trampoline Note offline service worker.
 * Pre-caches the navigation shell and lazily caches built JS/CSS/fonts/icons
 * so an installed PWA can launch with zero network. API requests are NOT
 * intercepted — offline behaviour for data is handled at the React layer. */

const CACHE = 'tn-shell-v10';

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
      await Promise.all(
        APP_SHELL.map((url) =>
          fetch(url, { cache: 'reload', credentials: 'same-origin' })
            .then((res) => (res && res.ok ? cache.put(url, res) : null))
            .catch(() => null),
        ),
      );
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
      self.clients.claim(),
    ]),
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

  // Same-origin assets and cross-origin (Google Fonts, etc.):
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
