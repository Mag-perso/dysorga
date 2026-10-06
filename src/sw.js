// Service worker : l'appli s'ouvre même sans réseau, et le parent reçoit les rappels.
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corps: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.titre || "DysOrga", {
    body: d.corps || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    lang: "fr",
    tag: d.titre || "dysorga",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (fenetres.length) return fenetres[0].focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
