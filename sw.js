// IKB Electricals — Shop Manager
// Service Worker: makes the app launchable and fully usable with no network,
// after it has been opened once while online.
//
// This file MUST live in the same folder as index.html on your web host
// (it is registered with a relative path, './sw.js', so its scope covers
// everything in that folder).

const CACHE_NAME = 'ikb-shop-shell-v2';

// The app shell + every external resource the page depends on.
// These are fetched and stored the first time the app is opened online.
// NOTE: we deliberately do NOT include './' here. cache.addAll() is
// all-or-nothing — if a bare './' request 404s/redirects on your host,
// the ENTIRE install fails and index.html never gets cached, which is
// why offline refresh was falling through to Chrome's own offline page.
const APP_SHELL = [
  './index.html'
];

const RUNTIME_SEEDS = [
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache the app shell first (must succeed for offline launch to work).
      return cache.addAll(APP_SHELL).then(() =>
        // Best-effort cache of CDN assets — don't fail install if one is blocked.
        Promise.all(
          RUNTIME_SEEDS.map(url =>
            fetch(url, { mode: 'cors' })
              .then(res => { if (res && res.ok) return cache.put(url, res); })
              .catch(() => {})
          )
        )
      );
    })
  );
});

// Keep the immediately-previous cache around as a safety net. If an
// update's install step doesn't finish re-caching every runtime asset
// before you go offline, the old cache still has them, and the
// "everything else" handler below (which searches ALL caches) will
// still find fonts/Chart.js/Firebase/etc instead of coming up empty.
const KEEP_CACHES = [CACHE_NAME, 'ikb-shop-shell-v1'];

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP_CACHES.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Page navigations (including refresh): always resolve to a real,
  // valid Response — cached app shell first, so the app launches/refreshes
  // with zero network. Refresh the cache in the background when online.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match('./index.html');

      // Fire off a network refresh in the background (don't block on it,
      // don't let its rejection propagate — a failed background refresh
      // must never turn into a null/undefined response to respondWith).
      const networkRefresh = fetch(req)
        .then(res => {
          if (res && res.ok) cache.put('./index.html', res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) return cached;

      // Nothing cached yet (e.g. very first launch): wait for network.
      const fresh = await networkRefresh;
      if (fresh) return fresh;

      // Truly nothing available — return a real Response, never null,
      // so Chrome renders this instead of its own offline interstitial.
      return new Response(
        '<h1>Offline</h1><p>Open this app once while online, then it will work offline.</p>',
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      );
    })());
    return;
  }

  // Everything else (fonts, chart.js, firebase SDK, etc.): cache-first,
  // falling back to network and storing whatever comes back for next time.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          if (res && res.ok && res.type !== 'opaqueredirect') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'IKB Shop', body: 'Low stock alert!' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico'
  }));
});
