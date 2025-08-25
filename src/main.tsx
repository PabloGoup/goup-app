// src/main.tsx
import React, { StrictMode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ToastProvider } from "./components/ToastProvider";
import { applyTheme, getSavedTheme } from "@/lib/theme";

// ---- ErrorBoundary: evita pantalla en blanco ante errores de runtime ----
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("[AppErrorBoundary] runtime error:", error, info);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div
          style={{
            width: "100%",
            maxWidth: 640,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.15)",
            background: "rgba(0,0,0,.4)",
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Algo salió mal</h1>
          <p style={{ opacity: 0.8, marginBottom: 12 }}>
            Ocurrió un error al cargar esta vista. Recarga la página o vuelve al inicio.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => location.reload()}
              style={{ padding: "8px 14px", borderRadius: 8, background: "#8e2afc", color: "white", fontWeight: 600 }}
            >
              Recargar
            </button>
            <a href="/" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)" }}>
              Ir al inicio
            </a>
          </div>
          {import.meta.env.DEV && this.state.error ? (
            <pre
              style={{
                marginTop: 16,
                maxHeight: 200,
                overflow: "auto",
                fontSize: 12,
                background: "rgba(255,255,255,.06)",
                padding: 12,
                borderRadius: 8,
              }}
            >
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }
}

// Fallback mientras React monta/precarga
function BootSplash() {
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <div style={{ opacity: 0.8 }}>Cargando…</div>
    </div>
  );
}

/* ------------------ Service Worker ------------------
 * - Sólo se registra en producción.
 * - En desarrollo se desregistra y se limpian caches para evitar “pantalla en blanco”
 *   o fetchs interceptados al volver desde Flow.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  // limpiar caches del SW viejo
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

// Logs globales útiles en dev
if (import.meta.env.DEV) {
  window.addEventListener("error", (e) => {
    console.error("[global error]", (e as any).error || (e as any).message || e);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[unhandledrejection]", (e as any).reason || e);
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<BootSplash />}>
        <App />
        <ToastProvider />
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>
);

// Tema
applyTheme(getSavedTheme());