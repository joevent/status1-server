// Status 1 – Offline-Unterstützung. Bei Änderungen an der App VERSION erhöhen.
const VERSION = "status1-v0.5.3";
const SHELL = ["./", "./index.html", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png",
  "./fonts/barlow-condensed-500.woff", "./fonts/barlow-condensed-600.woff", "./fonts/barlow-condensed-700.woff",
  "./fonts/barlow-400.woff", "./fonts/barlow-500.woff", "./fonts/barlow-600.woff",
  "./lib/qrcode.js", "./lib/jsQR.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Seite: zuerst Netz (für Updates), sonst Cache (offline)
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { caches.open(VERSION).then(c => c.put("./index.html", res.clone())); return res; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
