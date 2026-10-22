"use strict";
// Release identifier is derived from the HTML and manifest.
const VERSION = "a0cf59e366e24de9";
const BASE = new URL("./", self.location.href);
const PREFIX = "edu-manager:" + BASE.pathname + ":";
const CACHE = PREFIX + VERSION;
const STAGING = CACHE + ":staging";
const FILES = ["EduManager.html", "index.html", "app.webmanifest"];
const URLS = FILES.map(name => new URL(name, BASE).href);
const APP = new URL("EduManager.html", BASE).href;
let activationReady = Promise.resolve();

self.addEventListener("install", event => event.waitUntil((async () => {
  // Installation failure never removes the previous active cache.
  await caches.delete(STAGING);
  const cache = await caches.open(STAGING);
  try {
    for (const url of URLS) {
      const response = await fetch(new Request(url, {cache: "reload", credentials: "same-origin"}));
      if (!response.ok || response.redirected || response.type === "opaque") throw Error("Incomplete offline download");
      await cache.put(url, response);
    }
  } catch (error) {
    await caches.delete(STAGING);
    throw error;
  }
})()));

self.addEventListener("activate", event => {
  activationReady = (async () => {
    const staging = await caches.open(STAGING);
    const responses = await Promise.all(URLS.map(url => staging.match(url)));
    if (!responses.every(Boolean)) throw Error("Offline installation is incomplete");
    const cache = await caches.open(CACHE);
    for (let i = 0; i < URLS.length; i++) await cache.put(URLS[i], responses[i]);
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })();
  event.waitUntil(activationReady);
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== BASE.origin) return;
  const navigation = event.request.mode === "navigate" &&
    [BASE.pathname, new URL("index.html", BASE).pathname, new URL("EduManager.html", BASE).pathname].includes(url.pathname);
  if (navigation || URLS.includes(url.href)) {
    event.respondWith((async () => {
      await activationReady;
      const cache = await caches.open(CACHE);
      return await cache.match(navigation ? APP : event.request) || fetch(event.request);
    })());
  }
});

self.addEventListener("message", event => {
  if (event.data?.type === "OFFLINE_STATUS") event.waitUntil((async () => {
    // A new controller can receive messages before activation finishes promoting files.
    await activationReady;
    const cache = await caches.open(CACHE);
    const ready = (await Promise.all(URLS.map(url => cache.match(url)))).every(Boolean);
    event.ports[0]?.postMessage({ready, version: VERSION});
  })());
  if (event.data?.type === "APPLY_UPDATE") event.waitUntil(self.skipWaiting());
});
