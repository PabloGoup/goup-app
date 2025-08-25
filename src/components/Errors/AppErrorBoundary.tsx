import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: any };

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    // Log opcional
    console.error("[AppErrorBoundary] runtime error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // UI segura en caso de crash (evita la pantalla blanca)
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
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#8e2afc",
                color: "white",
                fontWeight: 600,
              }}
            >
              Recargar
            </button>
            <a
              href="/"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.15)",
              }}
            >
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