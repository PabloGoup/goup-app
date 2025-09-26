// src/components/analytics/SalesLine.tsx
import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function SalesLine({ data }: { data: { date: string; gmv: number; tickets: number }[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm text-white/70 mb-2">Ventas por día</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)"/>
            <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}/>
            <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}/>
            <Tooltip wrapperStyle={{ outline: "none" }}/>
            <Line type="monotone" dataKey="gmv" stroke="#a78bfa" strokeWidth={2} dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}