// src/pages/PaymentReturn.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Firestore, collection, getDocs, query, where } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";

type OrderItemDoc = {
  orderId: string;
  status: "pending" | "paid" | "failed";
  paidAt?: number | null;
  email?: string | null;
  buyerUid?: string | null;
  buyerName?: string | null;
  provider?: "flow";
  token?: string | null;
  flowOrder?: number | null;
  currency: "CLP" | "USD";
  // producto
  eventId?: string | null;
  eventName?: string | null;
  eventImage?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  ticketId?: string | null;
  ticketName?: string | null;
  ticketPath?: string | null;
  qty: number;
  price: number; // unitario
  lineTotal?: number;
  createdAt?: number;
  updatedAt?: number;
};

const fmtCurrency = (c: string) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: c === "USD" ? "USD" : "CLP",
    maximumFractionDigits: 0,
  });

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function PaymentReturnPage() {
  const q = useQuery();
  const orderId = q.get("order") || "";

  const [items, setItems] = useState<OrderItemDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!orderId) { setLoading(false); return; }
      try {
        const qq = query(collection(firebaseDb as Firestore, "orders"), where("orderId", "==", orderId));
        const snap = await getDocs(qq);
        if (!alive) return;
        const list: OrderItemDoc[] = snap.docs.map(d => ({ ...(d.data() as any) })) as any;
        setItems(list);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [orderId]);

  if (!orderId) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p>No se indicó orden.</p>
        <Link to="/mis-tickets" className="text-[#cbb3ff] underline">Volver a mis tickets</Link>
      </div>
    );
  }

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-8">Cargando orden…</div>;

  if (items.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p>No hay ítems para la orden {orderId}.</p>
        <Link to="/mis-tickets" className="text-[#cbb3ff] underline">Volver a mis tickets</Link>
      </div>
    );
  }

  const currency = items[0].currency || "CLP";
  const fmt = fmtCurrency(currency);
  const totalQty = items.reduce((a, it) => a + (it.qty || 0), 0);
  const subtotal = items.reduce((a, it) => a + Math.round(it.price || 0) * (it.qty || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
          Orden de compra <span className="text-[#8e2afc]">{orderId}</span>
        </h1>
        <Link to="/mis-tickets" className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 text-sm">
          Volver a mis tickets
        </Link>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4 mt-4">
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-white/70">Estado</div>
            <div className="font-medium">{items.every(i => i.status === "paid") ? "Pagada" : "Pendiente"}</div>
          </div>
          <div>
            <div className="text-white/70">Ítems / Cantidad total</div>
            <div>{items.length} / {totalQty}</div>
          </div>
          <div>
            <div className="text-white/70">Subtotal</div>
            <div className="font-semibold">{fmt.format(subtotal)}</div>
          </div>
        </div>
      </section>

      <div className="mt-4 space-y-3">
        {items.map((it, idx) => {
          const sub = Math.round(it.price || 0) * (it.qty || 0);
          return (
            <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-4">
              <figure className="w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0">
                {it.eventImage ? (
                  <img src={it.eventImage} alt={it.eventName || ""} className="w-full h-full object-cover" />
                ) : <div className="w-full h-full grid place-items-center text-xs text-white/60">Evento</div>}
              </figure>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{it.eventName || "Evento"}</div>
                    <div className="text-sm text-white/70 truncate">{it.ticketName || "Entrada"}</div>
                    <div className="text-xs text-white/60">
                      {it.eventStart ? new Date(it.eventStart).toLocaleString("es-CL") : "—"}
                      {it.eventEnd ? ` – ${new Date(it.eventEnd).toLocaleString("es-CL")}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-white/70">Precio</div>
                    <div className="font-semibold">{fmt.format(Math.round(it.price || 0))}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-sm text-white/70">Cantidad: {it.qty || 0}</div>
                  <div className="text-lg font-extrabold tracking-tight">{fmt.format(sub)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}