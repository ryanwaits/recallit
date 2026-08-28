// recallit · minimal app-shell service worker.
// Caches ONLY the static shell (HTML, favicon, manifest). Never caches /ws,
// /api/*, or /media/* — sessions, data, and audio are always live + honest.
const SHELL = "recallit-shell-v1";
const ASSETS = ["/", "/index.html", "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never intercept live endpoints — always hit the network.
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws") || url.pathname.startsWith("/media/")) return;
  // Shell: cache-first for the page + static assets; everything else network-first.
  if (ASSETS.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
  }
});
