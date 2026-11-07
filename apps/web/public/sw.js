// Minimal service worker: installability, an offline fallback for page navigations and a push stub.
// It never caches API responses or any other request: only the static offline page below.
const CACHE = "escolta-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only top-level page navigations; everything else (including /api) goes straight to the network.
  if (req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(() => caches.open(CACHE).then((cache) => cache.match(OFFLINE_URL))),
  );
});

// Push: shows a notification from the payload ({ title, body, url }). The server sends one when HR
// publishes a need (apps/web/lib/push.ts); the payload never names the person.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Escolta activa", {
      body: data.body || "Tens preguntes noves · Tienes preguntas nuevas · New questions",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  // Focus an open app window on the answering screen if there is one; otherwise open it.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) return win.navigate(url).then((w) => (w || win).focus()).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    }),
  );
});
