// src/lib/http.ts
export const FLOW_BASE = import.meta.env.VITE_FLOW_BASE || "";

export const join = (base: string, path: string) =>
  base
    ? `${base.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`
    : path;