// Básico: cache first para imágenes, SWR para el resto estático
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "images",
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 })], // 7 días
  })
);

registerRoute(
  ({ request }) => ["script", "style", "font"].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: "assets" })
);