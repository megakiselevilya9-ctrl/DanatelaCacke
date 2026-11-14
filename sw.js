/* Build replaces __BUILD_ID__. Cache holds only public application assets, never orders. */
'use strict';
const VERSION = '__BUILD_ID__';
const BASE = new URL('./', self.location.href);
const PREFIX = 'danatela:' + BASE.pathname + ':';
const CACHE = PREFIX + VERSION;
const FILES = ['index.html', 'pwa.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const ASSETS = FILES.map(file => new URL(file, BASE).href);
const INDEX = new URL('index.html', BASE).href;

self.addEventListener('install', event => {
  // Installation is atomic: an incomplete set of assets must not become the offline app.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    // Do not skipWaiting automatically: preserve the active session until user accepts an update.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Only canonical application documents use the offline shell; no catch-all HTML for missing assets.
  const documentPath = url.pathname === BASE.pathname || url.pathname === new URL('index.html', BASE).pathname;
  const sourcePreviewPath = url.pathname === new URL('danatela-local.html', BASE).pathname;
  if (request.mode === 'navigate' && (documentPath || sourcePreviewPath)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(INDEX)) || fetch(request);
    })());
    return;
  }
  const canonical = new URL(url.pathname, BASE.origin).href;
  if (!ASSETS.includes(canonical)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(canonical);
    if (cached) return cached;
    // Network fallback is not persisted, so no unlisted response is cached.
    return fetch(request);
  })());
});
