// DoughLine service worker.
//
// Deliberately small: it never caches pages or data, so prices and margins
// are always live. It only
//   - shows /offline when a page can't load because there's no connection, and
//   - keeps Next's hashed static files (/_next/static/…) and the icons, which
//     never change once published, so the app shell loads fast.
// Bump VERSION to drop old caches after changing this file.
const VERSION = "v1";
const CACHE = `doughline-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch(OFFLINE_URL, { cache: "reload" });
      await cache.put(OFFLINE_URL, res.clone());
      // Precache the offline page's own scripts, styles and fonts so it
      // renders fully with no network at all.
      const html = await res.text();
      const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) ?? [])];
      await cache.addAll(["/icons/icon-192.png", ...assets]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("doughline-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) (await caches.open(CACHE)).put(request, res.clone());
        return res;
      })(),
    );
  }
  // Everything else (pages' data, API routes, Supabase) goes straight to the network.
});
