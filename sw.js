const CACHE_NAME = "panini-v1";
const SHELL = ["/", "/css/styles.css", "/css/panini.css"];

self.addEventListener("install", e =>
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)))
);

self.addEventListener("activate", e =>
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
);

self.addEventListener("fetch", e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
