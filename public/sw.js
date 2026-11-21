/* Service worker (PRD §15 offline): plan, list and recipe pages + current plan JSON work offline.
   Static assets cache-first; pages and plan data network-first with cache fallback. No third parties. */
const VERSION = 'ms-v1';
const PAGES = ['/plan', '/list'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => Promise.all(PAGES.map((p) => c.add(new Request(p, { credentials: 'same-origin' })).catch(() => undefined)))),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const isPage = (url) => url.pathname === '/plan' || url.pathname === '/list' || url.pathname.startsWith('/recipe/');
const isPlanData = (url) => url.pathname === '/api/plans/latest' || /^\/api\/plans\/[0-9a-f-]{36}(\/ticks)?$/.test(url.pathname);

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req));
  } else if ((req.mode === 'navigate' && isPage(url)) || isPlanData(url) || (isPage(url) && url.searchParams.has('_rsc'))) {
    event.respondWith(networkFirst(req));
  }
});

// Web push (Phase 6)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '', { body: data.body || '', data: { url: data.url || '/plan', id: data.id }, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, id } = event.notification.data || {};
  event.waitUntil(
    (id ? fetch('/api/push/opened', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => undefined) : Promise.resolve()).then(() =>
      self.clients.openWindow(url || '/plan'),
    ),
  );
});
