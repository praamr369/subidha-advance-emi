// SUBIDHA CORE — Enterprise Offline Service Worker (v5.0)
// Mobile PWA resilience for Customers, Partners, Staff, Vendors, and Counter POS.

const STATIC_CACHE_NAME = "subidha-core-static-v5";
const PAGES_CACHE_NAME = "subidha-core-pages-v5";
const API_CACHE_NAME = "subidha-core-api-v5";

const STATIC_ASSETS = [
  "/brand/logo.png",
  "/brand/icon-192.png",
  "/brand/icon-512.png",
  "/brand/icon-maskable-192.png",
  "/brand/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/manifest.webmanifest",
];

const CORE_APP_ROUTES = [
  "/",
  "/login",
  "/business/login",
  "/customer",
  "/customer/dashboard",
  "/customer/catalog",
  "/customer/payments",
  "/customer/contracts",
  "/partner",
  "/partner/catalog",
  "/partner/customers",
  "/partner/collections",
  "/staff",
  "/staff/profile",
  "/vendor",
  "/admin",
  "/admin/billing/direct-sale",
  "/admin/billing/direct-sales",
  "/admin/billing/invoices",
  "/admin/billing/receipts",
  "/admin/manufacturing",
  "/admin/manufacturing/jobs",
  "/admin/manufacturing/boms",
  "/admin/inventory/stock-on-hand",
  "/admin/customers",
  "/admin/deliveries",
  "/admin/sales",
  "/admin/collections",
  "/admin/offline",
];

const CORE_ADMIN_ROUTES = CORE_APP_ROUTES;

// Install: Cache critical static assets immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate: Clean up older cache versions and claim clients
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

// Listen for dynamic route pre-caching from the client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "PRE_CACHE_ROUTES") {
    const routes = event.data.routes || CORE_ADMIN_ROUTES;
    event.waitUntil(
      Promise.all([
        caches.open(PAGES_CACHE_NAME),
        caches.open(STATIC_CACHE_NAME),
      ]).then(async ([pagesCache, staticCache]) => {
        for (const route of routes) {
          try {
            // Fetch normal route HTML
            const res = await fetch(route);
            if (res.ok) {
              await pagesCache.put(route, res.clone());
              const text = await res.text();

              // Extract and pre-cache Next.js static bundles and stylesheets
              const scriptMatches = text.matchAll(/src="(\/_next\/static\/[^"]+)"/g);
              for (const m of scriptMatches) {
                try {
                  const sRes = await fetch(m[1]);
                  if (sRes.ok) await staticCache.put(m[1], sRes);
                } catch {
                  // ignore
                }
              }

              const styleMatches = text.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g);
              for (const m of styleMatches) {
                try {
                  const cRes = await fetch(m[1]);
                  if (cRes.ok) await staticCache.put(m[1], cRes);
                } catch {
                  // ignore
                }
              }
            }

            // Also fetch and cache RSC route payload
            try {
              const rscRes = await fetch(route, { headers: { RSC: "1" } });
              if (rscRes.ok) {
                await pagesCache.put(`${route}?_rsc=1`, rscRes.clone());
                await pagesCache.put(route, rscRes);
              }
            } catch {
              // ignore
            }
          } catch {
            // ignore individual route cache failure
          }
        }
      })
    );
  }
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

  // Never cache authentication token endpoints
  if (url.pathname.includes("/auth/refresh/") || url.pathname.includes("/auth/token/")) {
    return;
  }

  // 1. Static Next.js Bundles, Manifest & Assets: Cache-first with network fallback
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
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname === "/manifest.webmanifest"
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
        }).catch(() => {
          // If offline and asset is missing, return 404 rather than hanging
          return new Response("", { status: 404 });
        });
      })
    );
    return;
  }

  // 2. Full Page Navigation (HTML): Stale-While-Revalidate with Instant Cache Return
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        // Match exact or role-specific cached shell
        const cached = await caches.match(request);
        const pathCached = !cached ? await caches.match(url.pathname) : null;
        let roleShell = null;

        if (!cached && !pathCached) {
          if (url.pathname.startsWith("/admin")) {
            roleShell = await caches.match("/admin");
          } else if (url.pathname.startsWith("/business/login") || url.pathname.startsWith("/login")) {
            roleShell = await caches.match("/business/login");
          } else if (url.pathname.startsWith("/customer")) {
            roleShell = await caches.match("/customer");
          } else if (url.pathname.startsWith("/partner")) {
            roleShell = await caches.match("/partner");
          } else if (url.pathname.startsWith("/staff")) {
            roleShell = await caches.match("/staff");
          } else if (url.pathname.startsWith("/vendor")) {
            roleShell = await caches.match("/vendor");
          }
        }

        const immediateResponse = cached || pathCached || roleShell;

        // Background revalidation to keep cached shell fresh
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(PAGES_CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => undefined);

        // If we have any cached shell, return it INSTANTLY (0ms network delay)
        if (immediateResponse) {
          return immediateResponse;
        }

        // Otherwise wait for network response on cold start
        const networkRes = await networkFetch;
        if (networkRes) return networkRes;

        const homeShell = await caches.match("/");
        if (homeShell) return homeShell;

        // 4. Default Offline Shell fallback
          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8"/>
              <title>Subidha — Offline</title>
              <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; padding: 1rem; box-sizing: border-box; }
                .card { max-width: 440px; width: 100%; padding: 2rem; text-align: center; background: #1e293b; border-radius: 1.25rem; border: 1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
                h1 { font-size: 1.35rem; margin-bottom: 0.75rem; color: #f59e0b; }
                p { font-size: 0.9rem; line-height: 1.5; color: #94a3b8; margin-bottom: 1.5rem; }
                button { background: #0284c7; color: white; border: none; padding: 0.75rem 1.5rem; font-weight: 600; border-radius: 0.75rem; cursor: pointer; font-size: 0.95rem; width: 100%; }
                button:hover { background: #0369a1; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>Device Offline</h1>
                <p>You are currently offline. Any previously cached views, customer details, and queued actions will remain safely available and reconnect once online.</p>
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

  // 3. Next.js App Router Client-Side Route Transitions (RSC / _rsc)
  if (
    request.headers.get("RSC") === "1" ||
    url.searchParams.has("_rsc")
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
          // 1. Check exact requested RSC url
          const cached = await caches.match(request);
          if (cached) return cached;

          // 2. Check pathname with _rsc=1
          const rscMatch = await caches.match(`${url.pathname}?_rsc=1`);
          if (rscMatch) return rscMatch;

          // 3. Check plain pathname
          const plainMatch = await caches.match(url.pathname);
          if (plainMatch) return plainMatch;

          // Only return /admin if the actual route requested is /admin
          if (url.pathname === "/admin" || url.pathname === "/admin/") {
            const adminMatch = (await caches.match("/admin?_rsc=1")) || (await caches.match("/admin"));
            if (adminMatch) return adminMatch;
          }

          // Avoid crashing Next.js router
          return new Response(
            JSON.stringify({ error: "Offline: Route not cached", offline: true }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
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
          // 1. Try exact match
          const cached = await caches.match(request);
          if (cached) return cached;

          // 2. Try match without query string
          const exactWithoutQuery = await caches.match(url.pathname);
          if (exactWithoutQuery) return exactWithoutQuery;

          return new Response(
            JSON.stringify({ error: "Offline: Network unavailable.", offline: true }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        })
    );
    return;
  }
});
