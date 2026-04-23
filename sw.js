const CACHE_NAME = "mylock-cache-v1";

const urlsToCache = [
  "/",
  "/index.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (let url of urlsToCache) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn("Cache fail:", url);
        }
      }
    })
  );
});