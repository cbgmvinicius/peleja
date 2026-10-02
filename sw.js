const CACHE_NAME = 'peleja-v25.5';
const APP_SHELL = ['./', './index.html', './styles.css', './storage.js', './app.js', './ui.js', './academic-data.js', './academic-data.json', './supabase-config.js', './cloud.js', './manifest.webmanifest'];
const SHELL_URLS = new Set(APP_SHELL.map((path) => new URL(path, self.location.href).href));
self.addEventListener('install', (event) => {
  // A new worker must not seed its cache with an older HTTP-cached release.
  const requests = APP_SHELL.map(path => new Request(new URL(path, self.location.href), { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(requests)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('peleja-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  // Cache only the explicit public shell. No API or arbitrary GETs.
  if (event.request.method !== 'GET' || event.request.headers.has('authorization')) return;
  if (!SHELL_URLS.has(event.request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type !== 'opaque') await cache.put(event.request, response.clone());
    return response;
  })());
});
