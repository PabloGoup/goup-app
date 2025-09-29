// src/components/analytics/Bars.tsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function Bars({ title, data, dataKey, labelKey = "name" }:
  { title: string; data: any[]; dataKey: string; labelKey?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm text-white/70 mb-2">{title}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)"/>
            <XAxis dataKey={labelKey} tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} interval={0}/>
            <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}/>
            <Tooltip wrapperStyle={{ outline: "none" }}/>
            <Bar dataKey={dataKey} fill="#c4b5fd"/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}