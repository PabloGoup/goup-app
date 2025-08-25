// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  appType: "spa",                 // fallback SPA para /pago/retorno
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,                   // permite acceso por IP/ngrok
    port: 5173,
    strictPort: true,
    headers: { "Cache-Control": "no-store" }, // evita caché en dev (Safari)
    proxy: {
      "/api/flow": {
        target: "http://localhost:8788",
        changeOrigin: true,
        secure: false,            // por si target no tiene https
        // ws: false,             // normalmente no hace falta, pero puedes forzarlo
      },
    },
  },
});