// src/components/analytics/DataTable.tsx
import React from "react";

export function DataTable({ rows, columns }:{
  rows: any[];
  columns: { key: string; title: string; render?: (row:any)=>React.ReactNode }[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-white/70">
          <tr>
            {columns.map(c => (
              <th key={c.key} className="text-left px-3 py-2">{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="px-3 py-3 text-white/50" colSpan={columns.length}>Sin datos</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-t border-white/10">
              {columns.map(c => (
                <td key={c.key} className="px-3 py-2">{c.render ? c.render(r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}