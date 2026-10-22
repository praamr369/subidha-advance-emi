// SUBIDHA CORE — Lightweight Service Worker
// Enhances Asansol store offline counter resilience without interfering with financial mutations.
const CACHE_NAME = "subidha-core-v1";
const STATIC_ASSETS = [
  "/brand/logo.png",
  "/manifest.webmanifest",
  "/favicon.ico",
];

// Install: Cache critical static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate: Prune outdated caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network-first for all API / dynamic data to ensure 100% financial accuracy.
// Stale-while-revalidate for static assets (images, brand, fonts).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache mutation requests (POST, PUT, PATCH, DELETE) or auth endpoints
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/v1/auth/") ||
    url.pathname.includes("/token")
  ) {
    return;
  }

  // Static assets: Cache-first with network fallback
  if (
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML and API: Network-first, fallback to offline notice if network fails
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      return new Response(
        JSON.stringify({ error: "Offline: Network connectivity lost. Retrying when connection returns." }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    })
  );
});

