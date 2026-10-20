/* sw.js — minimal, safe service worker for "SDI Bairiya Office Toolkit".
   Purpose: Android Chrome needs a service worker with a fetch handler before
   it will offer to install the app (and list it in the phone's app search).
   Design rule: never break the app and never hide an update.

   Strategy: NETWORK-FIRST for everything on our own origin.
   - Online  -> always serve the fresh response from the network, and keep a
                copy in the cache for later.
   - Offline -> fall back to the cached copy (or the cached app shell for a
                navigation). If we have nothing cached we return a plain 504,
                so nothing ever throws.
   Because the network always wins when it is reachable, the officer never
   gets a stale index.html after an update. */

var CACHE = "sdi-bairiya-v1";

/* Files to pre-cache so the very first offline open still works. */
var SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

/* Install: pre-cache the shell, then activate straight away (skipWaiting)
   so a new sw.js takes effect without waiting for old tabs to close. */
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        // addAll() rejects if any single file is missing — do them one by one
        // and ignore misses so a missing file can never fail the install.
        return Promise.all(SHELL.map(function (url) {
          return cache.add(url).catch(function () { /* missing file -> skip */ });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

/* Activate: drop caches from older versions, then take control of open pages. */
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Fetch: network-first with a cache fallback. */
self.addEventListener("fetch", function (event) {
  var req = event.request;

  // Only GET, and only our own origin — never touch uploads/writes or other sites.
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        // Fresh network response wins; stash a clone for offline use.
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE)
            .then(function (cache) { return cache.put(req, copy); })
            .catch(function () { /* quota etc. -> ignore */ });
        }
        return res;
      })
      .catch(function () {
        // Offline: serve the cached copy if we have one.
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          // For a page navigation, fall back to the cached app shell.
          if (req.mode === "navigate") {
            return caches.match("./index.html").then(function (shell) {
              return shell || new Response("Offline", {
                status: 504, statusText: "Offline",
                headers: { "Content-Type": "text/plain" }
              });
            });
          }
          return new Response("Offline", {
            status: 504, statusText: "Offline",
            headers: { "Content-Type": "text/plain" }
          });
        });
      })
  );
});
