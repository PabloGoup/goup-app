// src/pages/AdminTraceAccepted.tsx (ejemplo)
import { useEffect, useState } from "react";
import { collectionGroup, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Trace = {
  bucket: "aceptados";
  ts: number;
  source?: string;
  amount?: number;
  email?: string;
  eventId?: string;
};

export default function AdminTraceAccepted() {
  const [rows, setRows] = useState<Trace[]>([]);

  useEffect(() => {
    (async () => {
      const q = query(
        collectionGroup(db, "aceptados"),
        orderBy("ts", "desc"),
        limit(50)
      );
      const snap = await getDocs(q);
      setRows(snap.docs.map(d => d.data() as Trace));
    })();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-3">Últimos aceptados</h1>
      <ul className="space-y-2 text-sm">
        {rows.map((r, i) => (
          <li key={i} className="bg-white/5 rounded p-3">
            {new Date(r.ts).toLocaleString("es-CL")} – {r.email ?? "—"} – {r.amount ?? "—"} – {r.eventId ?? "—"}
          </li>
        ))}
      </ul>
    </div>
  );
}