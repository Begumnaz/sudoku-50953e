const CACHE = 'sudoku-v3';

// Core app shell — always precached so the game works fully offline
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

// ── Install: precache app shell ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      // addAll with individual try/catch so one missing icon won't block install
      return Promise.allSettled(
        PRECACHE.map((url) =>
          cache.add(url).catch((err) => console.warn('SW: failed to cache', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// ── Activate: wipe old caches ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: stale-while-revalidate for navigation, cache-first for assets ──────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip chrome-extension and non-http requests
  if (!url.protocol.startsWith('http')) return;

  // For navigation requests (HTML pages) use network-first so updates land quickly,
  // but fall back to cache when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // For same-origin static assets (_next/static, icons, manifest) use cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached); // offline & not cached → undefined (browser shows error)
      })
    );
    return;
  }
});

// ── Background sync: cache any new Next.js JS/CSS chunks on first load ─────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_URLS') {
    caches.open(CACHE).then((cache) => cache.addAll(event.data.urls || []));
  }
});
