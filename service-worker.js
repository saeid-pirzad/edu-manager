'use strict';
// Update VERSION whenever the main HTML or install manifest changes.
const VERSION = 'a68f30baaf63e484';
const BASE = new URL('./', self.location.href);
const PREFIX = 'edu-manager:' + BASE.pathname + ':';
const CACHE = PREFIX + VERSION;
const FILES = ['EduManager.html', 'index.html', 'app.webmanifest'];
const URLS = FILES.map(name => new URL(name, BASE).href);
const APP = new URL('EduManager.html', BASE).href;

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try {
    for (const url of URLS) {
      const response = await fetch(new Request(url, {cache: 'reload', credentials: 'same-origin'}));
      if (!response.ok || response.redirected || response.type === 'opaque') throw Error('Incomplete offline download');
      await cache.put(url, response);
    }
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  }
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  }
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== BASE.origin) return;
  if (event.request.mode === 'navigate' &&
      [BASE.pathname, new URL('index.html', BASE).pathname, new URL('EduManager.html', BASE).pathname].includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(APP) || fetch(event.request);
    })());
  } else if (URLS.includes(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(event.request) || fetch(event.request);
    })());
  }
});

self.addEventListener('message', event => {
  if (event.data?.type === 'OFFLINE_STATUS') event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const ready = (await Promise.all(URLS.map(url => cache.match(url)))).every(Boolean);
    event.ports[0]?.postMessage({ready, version: VERSION});
  })());
  if (event.data?.type === 'APPLY_UPDATE') event.waitUntil((async () => {
    // Applying cached assets does not reload other windows or modify their data.
    // Only the requesting page reloads itself after saving its drafts.
    await self.skipWaiting();
  })());
});
