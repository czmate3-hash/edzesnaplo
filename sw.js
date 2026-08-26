const CACHE = 'edzesnaplo-v4';
const CORE = ['./', './index.html', './styles.css', './app.js', './auth-route.js', './qa-fixes.js', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.hostname.endsWith('.supabase.co') || request.headers.has('Authorization')) return;

  if (request.mode === 'navigate' || /\/(app|auth-route|qa-fixes|styles)\.js$|\/(styles)\.css$|manifest\.webmanifest$|\/icons\//.test(url.pathname)) {
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
