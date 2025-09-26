// src/components/analytics/Kpi.tsx
import React from "react";

export function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm text-white/60">{label}</div>
      <div className="text-2xl font-extrabold tracking-tight mt-1">{value}</div>
      {sub ? <div className="text-xs text-white/50 mt-1">{sub}</div> : null}
    </div>
  );
}