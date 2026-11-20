'use strict';
// GaanBox service worker: precaches the app shell so "My collection" works offline.
// API calls are never cached. Bump VERSION when shell files change.
const VERSION = 'gaanbox-v3';
const SHELL = [
  '/', '/style.css', '/theme-init.js', '/manifest.webmanifest', '/icons/icon.svg',
  '/src/main.js', '/src/helpers.js', '/src/collection.js', '/src/community.js',
  '/src/theme.js', '/src/toast.js', '/src/account.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Network first so updates show up; fall back to the cache when offline.
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(request, copy)); }
        return res;
      })
      .catch(async () => (await caches.match(request)) || (request.mode === 'navigate' ? caches.match('/') : Response.error())),
  );
});
