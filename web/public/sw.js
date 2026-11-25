// Kinguard service worker: offline app shell + Android share target.
// Shared text is handed to the page through Cache Storage, never through the URL.
const SHELL = 'kinguard-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('kinguard-shell') && k !== SHELL).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (e.request.method === 'POST' && url.pathname === '/share-target') {
    e.respondWith(
      (async () => {
        const form = await e.request.formData();
        const text = [form.get('title'), form.get('text'), form.get('url')].filter(Boolean).join('\n');
        const cache = await caches.open('kinguard-share');
        await cache.put('/__shared', new Response(text));
        return Response.redirect('/?shared=1', 303);
      })(),
    );
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Navigations: network first, cached shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Static assets: cache first (hashed filenames), then network.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});
