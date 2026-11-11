// SUBIDHA CORE — Enterprise Offline Service Worker (v3.1)
// Full offline counter resilience for Asansol showroom with zero interference to financial invariants.

const STATIC_CACHE_NAME = "subidha-core-static-v3";
const PAGES_CACHE_NAME = "subidha-core-pages-v3";
const API_CACHE_NAME = "subidha-core-api-v3";

const STATIC_ASSETS = [
  "/brand/logo.png",
  "/favicon.ico",
  "/manifest.webmanifest",
];

// Install: Cache critical static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate: Clean up older cache versions
self.addEventListener("activate", (event) => {
  const currentCaches = [STATIC_CACHE_NAME, PAGES_CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!currentCaches.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Strategy depending on request type
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Never intercept non-GET requests (handled by client outbox)
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // CRITICAL CSP GUARD: Only intercept same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache authentication tokens
  if (url.pathname.includes("/auth/refresh/") || url.pathname.includes("/auth/token/")) {
    return;
  }

  // 1. Static Next.js Bundles & Assets: Cache-first with network fallback
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 2. Full Page Navigation (HTML): Network-first with cache fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(PAGES_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;

          const adminShell = await caches.match("/admin");
          if (adminShell) return adminShell;

          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8"/>
              <title>SUBIDHA CORE — Offline Mode</title>
              <meta name="viewport" content="width=device-width, initial-scale=1"/>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
                .card { max-width: 480px; padding: 2.5rem; text-align: center; background: #1e293b; border-radius: 1rem; border: 1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
                h1 { font-size: 1.5rem; margin-bottom: 0.75rem; color: #f59e0b; }
                p { font-size: 0.95rem; line-height: 1.5; color: #94a3b8; margin-bottom: 1.5rem; }
                button { background: #d97706; color: white; border: none; padding: 0.75rem 1.5rem; font-weight: 600; border-radius: 0.5rem; cursor: pointer; }
                button:hover { background: #b45309; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>Store Offline Mode Active</h1>
                <p>SUBIDHA CORE is operating in offline resilience mode. Your cached data, counter POS, and pending outbox remain fully accessible.</p>
                <button onclick="window.location.reload()">Retry Connection</button>
              </div>
            </body>
            </html>`,
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        })
    );
    return;
  }

  // 3. Next.js App Router Client-Side Route Transitions (RSC / Admin routes)
  if (
    request.headers.get("RSC") === "1" ||
    url.searchParams.has("_rsc") ||
    url.pathname.startsWith("/admin/")
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(PAGES_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match("/admin");
        })
    );
    return;
  }

  // 4. API GET Requests: Network-first with cache fallback
  if (url.pathname.startsWith("/api/v1/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: "Offline: Network unavailable. Using cached local state." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        })
    );
    return;
  }
});
