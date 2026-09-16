/**
 * sw.js — offline support.
 *
 * Two different problems, two different strategies:
 *
 *  - The app itself must open with no signal at all, so the shell is precached and
 *    served cache-first. Opening the app is never a network event.
 *  - Forecasts must be as fresh as the connection allows but must still be there
 *    when it is not, so weather requests are network-first with a cache fallback.
 *    A farmer offline in a field gets this morning's forecast, not an error page.
 */

const VERSION = 'v1.3.0';
const SHELL = `miter-shell-${VERSION}`;
const DATA = `miter-data-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/agro.js',
  './js/i18n.js',
  './js/store.js',
  './js/weather.js',
  './js/assistant.js',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll is all-or-nothing; one 404 would leave the app with no offline copy
    // at all, so each file is added on its own and failures are tolerated.
    await Promise.all(PRECACHE.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete every cache this version does not own, whatever it is called. An
    // earlier build used a different prefix, and filtering by prefix left those
    // caches alive for ever: since `caches.match()` searches every cache in the
    // origin, the stale copies kept winning and the app never updated. This
    // origin serves one app, so anything not in KEEP is by definition rubbish.
    const KEEP = new Set([SHELL, DATA]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isWeatherHost = (url) =>
  url.hostname.endsWith('open-meteo.com');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Navigations: try the network briefly, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        // Scoped to this version's cache on purpose — see the note in `activate`.
        const cache = await caches.open(SHELL);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  if (isWeatherHost(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  // `caches.match(request)` searches EVERY cache in the origin, including ones
  // left by older builds. Always read from this version's cache by name.
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match('./index.html')) || Response.error();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    // An exact match first; otherwise any cached forecast for this endpoint is
    // still far more useful than nothing, even if the coordinates differ slightly.
    const exact = await cache.match(request);
    if (exact) return exact;
    const all = await cache.keys();
    const near = all.find((r) => new URL(r.url).pathname === new URL(request.url).pathname);
    if (near) return cache.match(near);
    return Response.error();
  }
}
