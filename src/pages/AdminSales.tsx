// src/pages/AdminSales.tsx
import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";

type Order = {
  orderId: string;
  status: string;
  email: string;
  eventId?: string;
  ticketName?: string;
  amount: number;
  currency: string;
  paidAt?: number;
  createdAt?: number;
  subject:  string;
};

export default function AdminSales() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const q = query(
          collection(firebaseDb, "orders"),
          where("status", "==", "paid"),
          orderBy("paidAt", "desc")
        );
        const snap = await getDocs(q);
        setItems(snap.docs.map(d => d.data() as Order));
      } catch (err: any) {
        // Índice faltante: Firestore lanza failed-precondition con un link
        const msg = String(err?.message || "");
        const match = msg.match(/https:\/\/console\.firebase\.google\.com\/[^\s)]+/);
        console.warn("[AdminSales] index required", err);
        if (match) {
          // opcional: abrir la creación del índice
          window.open(match[0], "_blank");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Ventas (tickets pagados)</h1>
      <table className="w-full text-sm border-separate border-spacing-y-2">
        <thead className="text-left text-white/70">
          <tr>
            <th>Fecha</th><th>Orden</th><th>Email</th><th>Evento</th><th>Ticket</th><th>Monto</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o, i) => (
            <tr key={i} className="bg-white/5">
              <td className="px-3 py-2">{o.paidAt ? new Date(o.paidAt).toLocaleString("es-CL") : "—"}</td>
              <td className="px-3 py-2">{o.orderId}</td>
              <td className="px-3 py-2">{o.email}</td>
              <td className="px-3 py-2">{o.subject || "—"}</td>
              <td className="px-3 py-2">{o.ticketName || "—"}</td>
              <td className="px-3 py-2">{o.currency} {Math.round(o.amount).toLocaleString("es-CL")}</td>
              <td className="px-3 py-2">{o.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}