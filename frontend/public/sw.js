// HealthQueue service worker. Caches the app shell and PUBLIC data only.
const VERSION = 'hq-v1';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

// Only these API responses are cached: no patient names in either
const CACHEABLE_API = [/\/api\/public\/queue$/, /\/api\/visits\/service-points$/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon.svg']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Mark a response as coming from the cache, so the app can say "offline"
const markCached = async (res) => {
  const headers = new Headers(res.headers);
  headers.set('X-HQ-From-Cache', '1');
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page loads: try the network, fall back to the cached app
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // The app's own files (scripts, styles, icon): cache first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // Public API data: network first, last saved copy when offline
  if (CACHEABLE_API.some((r) => r.test(url.pathname))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA).then((c) => c.put(req.url, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req.url);
          if (hit) return markCached(hit);
          return new Response(JSON.stringify({ error: 'Offline and no saved data' }), {
            status: 503, headers: { 'Content-Type': 'application/json' },
          });
        })
    );
  }
  // Everything else (login, registration, queue actions) goes straight to the network
});