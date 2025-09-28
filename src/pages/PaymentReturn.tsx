import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Firestore, collection, getDocs, query, where } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";

const PAY_BASE = (import.meta.env.VITE_PAYMENTS_BASE as string) || ""; // si está vacío, usamos rutas relativas

/* =========================
   Tipos de la orden/ítems
   ========================= */
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

/* =========================
   Helpers
   ========================= */
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

/** Limpia con fuerza cualquier traza de carrito y notifica a la UI. */
function clearLocalCart() {
  // Llaves conocidas
  const known = [
    "cart",
    "cart_v2",
    "goup_cart",
    "carrito",
    "checkout_items",
    "cart_event_id",
  ];

  // 1) Elimina llaves conocidas
  for (const k of known) {
    try { localStorage.removeItem(k); } catch {}
    try { sessionStorage.removeItem(k); } catch {}
  }

  // 2) Limpia llaves que contengan palabras típicas de carrito
  try {
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (/(cart|carrito|checkout)/i.test(key)) toDelete.push(key);
    }
    for (const k of toDelete) {
      try { localStorage.removeItem(k); } catch {}
    }
  } catch {}

  try {
    const toDelete: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (/(cart|carrito|checkout)/i.test(key)) toDelete.push(key);
    }
    for (const k of toDelete) {
      try { sessionStorage.removeItem(k); } catch {}
    }
  } catch {}

  // 3) Señaliza a la UI que el carrito fue limpiado
  try {
    const ts = Date.now().toString();
    localStorage.setItem("goup_cart_was_cleared", ts);
    localStorage.setItem("goup_cart_version", ts);
  } catch {}

  // 4) Notifica por evento custom
  try {
    window.dispatchEvent(new Event("goup:cart:cleared"));
  } catch {}
}

type CommitResp = {
  ok: boolean;
  status?: string;
  buyOrder?: string;
  amount?: number;
  cardDetail?: any;
  error?: string;
};

async function loadFinishedOrder(db: Firestore, orderId: string): Promise<OrderItemDoc[]> {
  const qq = query(
    collection(db, "finishedOrder"),
    where("orderId", "==", orderId)
  );
  const snap = await getDocs(qq);
  const list: OrderItemDoc[] = snap.docs.map(d => ({ ...(d.data() as any) })) as any;
  return list;
}

/* =========================
   Página de retorno de pago
   ========================= */
export default function PaymentReturnPage() {
  const q = useQuery();
  const orderId = q.get("order") || "";
  const navigate = useNavigate();

  const tokenWs = q.get("token_ws");
  const [commitDone, setCommitDone] = useState(false);
  const [commitErr, setCommitErr] = useState<string | null>(null);

  const [items, setItems] = useState<OrderItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearedOnce, setClearedOnce] = useState(false);

  const [pollTries, setPollTries] = useState(0);
  const [forceReloadTs, setForceReloadTs] = useState(0);

  // Si Webpay redirige con token_ws, hacemos commit al backend y normalizamos la URL a ?order=...
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tokenWs || commitDone) return;
      const GUARD_KEY = `wbp_committed_${tokenWs}`;
      if (sessionStorage.getItem(GUARD_KEY)) { setCommitDone(true); return; }
      try {
        const url = `${PAY_BASE}/api/webpay/commit` || "/api/webpay/commit";
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token_ws: tokenWs })
        });
        const data: CommitResp = await res.json().catch(() => ({ ok:false, error:"invalid json" } as any));
        if (!alive) return;
        if (res.ok && data.ok) {
          // Si el server devuelve buyOrder úsala para fijar la URL
          const nextOrder = data.buyOrder || orderId;
          // Limpia token_ws de la URL y asegura order
          const sp = new URLSearchParams(window.location.search);
          sp.delete("token_ws");
          if (nextOrder) sp.set("order", String(nextOrder));
          const next = `${window.location.pathname}?${sp.toString()}`;
          window.history.replaceState({}, "", next);
          sessionStorage.setItem(GUARD_KEY, "1");
          setCommitDone(true);
        } else {
          setCommitErr(data?.error || `Commit failed (${res.status})`);
          setCommitDone(true);
        }
      } catch (e: any) {
        if (!alive) return;
        setCommitErr(String(e?.message || e));
        setCommitDone(true);
      }
    })();
    return () => { alive = false; };
  }, [tokenWs, orderId, commitDone]);

  // Carga de ítems de la orden
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!orderId) { setLoading(false); return; } // orderId llegará tras commit si veníamos solo con token_ws
      setLoading(true);
      try {
        const list = await loadFinishedOrder(firebaseDb as Firestore, orderId);
        if (!alive) return;
        setItems(list);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [orderId]);

  // Polling para obtener estado cuando no hay items y tenemos orderId
  useEffect(() => {
    if (!orderId || items.length > 0) return;

    let alive = true;
    let tries = 0;
    let timeoutId: any;

    const poll = async () => {
      if (!alive) return;
      tries++;
      setPollTries(tries);
      try {
        const url = `${PAY_BASE}/api/flow/status?order=${encodeURIComponent(orderId)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Status fetch failed (${res.status})`);
        const data = await res.json();
        if (!alive) return;

        if (Array.isArray(data?.data?.items) && data.data.items.length > 0) {
          // Map items to OrderItemDoc
          const newItems: OrderItemDoc[] = data.data.items.map((it: any) => ({
            orderId: it.orderId,
            status: it.status,
            paidAt: it.paidAt,
            email: it.email,
            buyerUid: it.buyerUid,
            buyerName: it.buyerName,
            provider: it.provider,
            token: it.token,
            flowOrder: it.flowOrder,
            currency: it.currency,
            eventId: it.eventId,
            eventName: it.eventName,
            eventImage: it.eventImage,
            eventStart: it.eventStart,
            eventEnd: it.eventEnd,
            ticketId: it.ticketId,
            ticketName: it.ticketName,
            ticketPath: it.ticketPath,
            qty: it.qty,
            price: it.price,
            lineTotal: it.lineTotal,
            createdAt: it.createdAt,
            updatedAt: it.updatedAt,
          }));
          setItems(newItems);
          if (data.data.status === "paid") {
            clearLocalCart();
          }
        } else if (data.data.status === "paid") {
          // Reattempt loadFinishedOrder immediately
          const list = await loadFinishedOrder(firebaseDb as Firestore, orderId);
          if (!alive) return;
          if (list.length > 0) {
            setItems(list);
            clearLocalCart();
          } else if (tries < 12) {
            timeoutId = setTimeout(poll, 1500);
          }
        } else if (tries < 12) {
          timeoutId = setTimeout(poll, 1500);
        }
      } catch {
        if (tries < 12) {
          timeoutId = setTimeout(poll, 1500);
        }
      }
    };

    poll();

    return () => {
      alive = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [orderId, items.length, forceReloadTs]);

  // Si la orden está 100% pagada, limpiar carrito una sola vez
  const allPaid = items.length > 0 && items.every(i => i.status === "paid");
  const anyFailed = items.some(i => i.status === "failed");
  const anyPending = items.length > 0 && items.some(i => i.status === "pending");

  useEffect(() => {
    if (allPaid && !clearedOnce) {
      clearLocalCart();
      setClearedOnce(true);
    }
  }, [allPaid, clearedOnce]);

  if (!orderId) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p>No se indicó orden.</p>
        <Link to="/mis-tickets" className="text-[#FE8B02] underline">
          Volver a mis tickets
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="animate-pulse h-6 w-48 rounded bg-white/10" />
        <div className="mt-4 space-y-2">
          <div className="h-20 rounded bg-white/5" />
          <div className="h-20 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p>No hay ítems para la orden {orderId || "(sin orden)"}.</p>
        {tokenWs && !orderId && (
          <p className="text-sm text-white/70 mt-2">Volviste desde Webpay. Confirmamos el pago automáticamente; si no ves la orden aún, espera unos segundos y recarga.</p>
        )}
        {commitErr && (
          <p className="text-sm text-red-300 mt-2">Error al confirmar el pago: {commitErr}</p>
        )}
        <button
          onClick={() => setForceReloadTs(Date.now())}
          className="text-[#FE8B02] underline mt-3 inline-block bg-transparent border-none cursor-pointer p-0"
          type="button"
        >
          Reintentar carga
        </button>
        <Link to="/mis-tickets" className="text-[#FE8B02] underline mt-3 inline-block ml-4">
          Volver a mis tickets
        </Link>
      </div>
    );
  }

  const currency = items[0].currency || "CLP";
  const fmt = fmtCurrency(currency);
  const totalQty = items.reduce((a, it) => a + (it.qty || 0), 0);
  const subtotal = items.reduce((a, it) => a + Math.round(it.price || 0) * (it.qty || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
          Orden de compra <span className="text-[#FE8B02]">{orderId}</span>
        </h1>
        <div className="flex items-center gap-2">
          <Link
            to="/mis-tickets"
            className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 text-sm text-[#FE8B02] underline"
          >
            Ir a mis tickets
          </Link>
          <button
            className="px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
            onClick={() => navigate("/carrito")}
          >
            Ir al carrito
          </button>
        </div>
      </div>

      {/* Estado/alerta */}
      {allPaid && (
        <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-200">
          <p className="font-semibold">¡Pago exitoso!</p>
          <p className="text-sm opacity-90">
            Tu pago fue procesado correctamente. Tu carrito ha sido vaciado.
            Revisa tus tickets en la sección <Link to="/mis-tickets" className="underline">Mis tickets</Link>.
          </p>
        </div>
      )}

      {anyFailed && !allPaid && (
        <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-red-200">
          <p className="font-semibold">Pago rechazado</p>
          <p className="text-sm opacity-90">
            Tu pago fue rechazado. Inténtalo nuevamente desde el carrito.
          </p>
        </div>
      )}

      {anyPending && !allPaid && !anyFailed && (
        <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-amber-200">
          <p className="font-semibold">Pago pendiente</p>
          <p className="text-sm opacity-90">
            Estamos esperando la confirmación del proveedor de pagos.
          </p>
        </div>
      )}

      {/* Resumen compacto */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 mt-4">
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-white/70">Estado</div>
            <div className="font-medium">
              {allPaid ? "Pagada" : anyFailed ? "Rechazada" : "Pendiente"}
            </div>
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

      {/* Ítems de la orden */}
      <div className="mt-4 space-y-3">
        {items.map((it, idx) => {
          const sub = Math.round(it.price || 0) * (it.qty || 0);
          return (
            <div
              key={idx}
              className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-4"
            >
              <figure className="w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0">
                {it.eventImage ? (
                  <img
                    src={it.eventImage}
                    alt={it.eventName || ""}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-xs text-white/60">
                    Evento
                  </div>
                )}
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