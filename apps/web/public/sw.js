/*
  The service worker.

  Its entire job is to answer one question: when a navigation cannot reach the
  origin, what does the visitor see? Without this they get the browser's own
  error page. With it they get `/offline`.

  ## It never caches a page

  This site is a CMS. The whole point of it is that an edit is live on the next
  request, and a service worker that stored HTML would break exactly that — a
  visitor would keep seeing whatever the page said when their browser last
  cached it, with no way to know it was old and no way to clear it. That is a
  far worse failure than the one this file exists to fix, so the rule here is
  absolute: **no HTML enters the cache except `/offline` itself**, which is a
  static page with no content in it.

  What is cached at runtime is `/_next/static/*`, and only because those URLs
  are content-hashed: a change to the file changes its name, so a stale copy is
  not reachable rather than merely unlikely. Those are also exactly the files
  `/offline` needs to render — and a visitor who has a service worker installed
  is by definition one who has loaded the site before, so they will be there.

  ## Everything else is passed straight through

  Not intercepted, not inspected, not cached: media from R2, the analytics
  beacon, the contact form, and every non-GET request. A service worker that
  touches a POST is a service worker that can lose someone's message.

  ## Removing it

  A service worker outlives a deployment — it stays installed in every browser
  that ever loaded it. Shipping an empty `sw.js` does not uninstall it. If this
  ever has to go, the file must first be replaced with one that calls
  `registration.unregister()`, and that version has to stay deployed long
  enough for browsers to pick it up.
*/

/** Bump to invalidate everything. The activate handler deletes other caches. */
const VERSION = "v1";

const OFFLINE_URL = "/offline";
const OFFLINE_CACHE = `offline-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

/** Runtime-cacheable paths. Content-hashed, therefore safe to keep forever. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      // `reload` so the install never stores a copy the HTTP cache was already
      // holding — the point of installing is to capture the current one.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      // Take over as soon as this version is ready rather than waiting for
      // every tab to close. Safe here precisely because nothing but immutable
      // assets is cached: there is no half-old page state to be inconsistent
      // with.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([OFFLINE_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => (keep.has(name) ? undefined : caches.delete(name))),
      );

      // Navigation preload lets the browser start the network request while
      // this worker is still booting, so intercepting navigations costs
      // nothing on a connection that is working.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET. A POST that failed must fail visibly — swallowing one would mean
  // a contact message that looked sent and never was.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          return await fetch(request);
        } catch {
          // The only branch that serves from cache, and the only page in it.
          const cache = await caches.open(OFFLINE_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("Offline", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;

        const response = await fetch(request);
        // Opaque and error responses are not stored: caching a 404 under an
        // immutable name would make it permanent.
        if (response.ok && response.type === "basic") {
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});
