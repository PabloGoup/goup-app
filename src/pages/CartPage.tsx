// src/pages/CartPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Firestore, doc, getDoc } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";
import { useAuth } from "@/auth/AuthContext";

/* ====== Config ====== */
const SERVICE_FEE_RATE = 0.12; // 12%

/* ====== Formateadores ====== */
const makeCurrency = (c: string) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: c === "USD" ? "USD" : "CLP",
    maximumFractionDigits: 0,
  });

/* ====== Carrito (localStorage) ====== */
type CartItem = {
  eventId: string;
  eventName: string;
  eventImage?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  ticketId: string;
  ticketName: string;
  price: number;
  currency: string;
  qty: number;
  ticketPath?: string | null; // "evento/{id}/ticketTypes/{ticketId}"
  addedAt: number;
};
const CART_KEY = "goupCart:v1";
function readCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeCart(items: CartItem[]) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {}
}

/* ====== Firestore shapes mínimos ====== */
type TicketTypeDoc = {
  id?: string;
  name: string;
  price: number;
  stockTotal: number;
  stockDisponible: number;
  perUserLimit: number | null;
  orden: number;
  activo: boolean;
};
type EventNew = {
  id?: string;
  nombre: string;
  venderTickets?: boolean;
  moneda?: "CLP" | "USD";
  perUserLimit?: number | null;
  ventaAbre?: string | null;
  ventaCierra?: string | null;
};
// Helper
const buildCartItemsForServer = (cart: CartItem[]) =>
  cart.map((it) => ({
    eventId: it.eventId,
    eventName: it.eventName,
    eventImage: it.eventImage || null,
    eventStart: it.eventStart || null,
    eventEnd: it.eventEnd || null,
    ticketId: it.ticketId,
    ticketName: it.ticketName,
    ticketPath: it.ticketPath || null,
    qty: Number(it.qty || 1),
    price: Number(it.price || 0),
    currency: it.currency || "CLP",
  }));

/* ====== Utils ====== */
const withinWindow = (start?: string | null, end?: string | null) => {
  const now = Date.now();
  const a = start ? new Date(start).getTime() : -Infinity;
  const b = end ? new Date(end).getTime() : Infinity;
  return now >= a && now <= b;
};

type ResolvedRow = {
  item: CartItem;
  event?: EventNew | null;
  ticket?: TicketTypeDoc | null;
  maxQty: number;
  canBuy: boolean;
  warnings: string[];
  priceNow: number;
  currency: string;
};

export default function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [cart, setCart] = useState<CartItem[]>(() => readCart());
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  /* === cargar info en vivo de cada item === */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const next: ResolvedRow[] = [];
      for (const item of cart) {
        try {
          const evRef = doc(firebaseDb as Firestore, "evento", item.eventId);
          const evSnap = await getDoc(evRef);
          const ev: EventNew | null = evSnap.exists()
            ? ({ id: evSnap.id, ...(evSnap.data() as any) } as EventNew)
            : null;

          let tk: TicketTypeDoc | null = null;
          if (item.ticketId) {
            const tkRef = doc(
              firebaseDb as Firestore,
              `evento/${item.eventId}/ticketTypes`,
              item.ticketId
            );
            const tkSnap = await getDoc(tkRef);
            tk = tkSnap.exists()
              ? ({ id: tkSnap.id, ...(tkSnap.data() as any) } as TicketTypeDoc)
              : null;
          }

          const warnings: string[] = [];
          const currency = ev?.moneda || item.currency || "CLP";
          const priceNow = typeof tk?.price === "number" ? tk!.price : item.price;

          const stock = Math.max(0, tk?.stockDisponible ?? 0);
          const perTicketLimit = Math.max(0, tk?.perUserLimit ?? 0);
          const perEventLimit = Math.max(0, ev?.perUserLimit ?? 0);
          const limit = [perTicketLimit, perEventLimit]
            .filter(Boolean)
            .reduce((a, b) => Math.min(a, b), Infinity);
          const maxByLimit = Number.isFinite(limit) ? (limit as number) : 999;
          const maxQty = Math.max(1, Math.min(stock || 0, maxByLimit || 999));

          const inWindow = withinWindow(ev?.ventaAbre ?? null, ev?.ventaCierra ?? null);
          const active = !!tk?.activo;
          const sellsHere = !!ev?.venderTickets;
          if (!sellsHere) warnings.push("Este evento no vende tickets en la plataforma.");
          if (!inWindow) warnings.push("Fuera de la ventana de venta.");
          if (!active) warnings.push("Este tipo de entrada está inactivo.");
          if ((tk?.stockDisponible ?? 0) <= 0) warnings.push("Sin stock disponible.");
          if (item.qty > maxQty) warnings.push(`Cantidad ajustada al máximo (${maxQty}).`);

          const canBuy = sellsHere && inWindow && active && (tk?.stockDisponible ?? 0) > 0 && maxQty >= 1;

          next.push({
            item,
            event: ev,
            ticket: tk,
            maxQty: Math.max(1, maxQty || 1),
            canBuy,
            warnings,
            priceNow,
            currency,
          });
        } catch (e) {
          console.warn("No se pudo resolver un item de carrito:", e);
          next.push({
            item,
            event: null,
            ticket: null,
            maxQty: Math.max(1, item.qty),
            canBuy: false,
            warnings: ["No se pudo validar el ticket en este momento."],
            priceNow: item.price,
            currency: item.currency || "CLP",
          });
        }
      }
      if (!alive) return;

      let adjusted = false;
      const fixedCart = cart.map((c) => {
        const r = next.find((n) => n.item.eventId === c.eventId && n.item.ticketId === c.ticketId);
        if (!r) return c;
        const clamped = Math.max(1, Math.min(r.maxQty, c.qty));
        if (clamped !== c.qty) adjusted = true;
        return { ...c, qty: clamped };
      });
      if (adjusted) {
        writeCart(fixedCart);
        setCart(fixedCart);
      }

      setRows(next);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [cart]);

  const currency = rows[0]?.currency || "CLP";
  const fmt = useMemo(() => makeCurrency(currency), [currency]);

  const allSameCurrency = useMemo(() => {
    if (rows.length === 0) return true;
    const first = rows[0].currency;
    return rows.every((r) => r.currency === first);
  }, [rows]);

  const rowSubtotalInt = (r: ResolvedRow) =>
    Math.round(r.priceNow || 0) * (r.item.qty || 0);

  const subtotalInt = useMemo(
    () => rows.reduce((acc, r) => acc + rowSubtotalInt(r), 0),
    [rows]
  );
  const serviceFeeInt = useMemo(
    () => Math.round(subtotalInt * SERVICE_FEE_RATE),
    [subtotalInt]
  );
  const totalInt = useMemo(
    () => subtotalInt + serviceFeeInt,
    [subtotalInt, serviceFeeInt]
  );

  const allBuyable = useMemo(() => rows.length > 0 && rows.every((r) => r.canBuy), [rows]);

  /* === Handlers === */
  const setQty = (row: ResolvedRow, qty: number) => {
    const q = Math.max(1, Math.min(row.maxQty, qty || 1));
    const next = cart.map((c) =>
      c.eventId === row.item.eventId && c.ticketId === row.item.ticketId
        ? { ...c, qty: q }
        : c
    );
    writeCart(next);
    setCart(next);
  };

  const removeItem = (row: ResolvedRow) => {
    const next = cart.filter(
      (c) => !(c.eventId === row.item.eventId && c.ticketId === row.item.ticketId)
    );
    writeCart(next);
    setCart(next);
    toast.success("Producto eliminado del carrito");
  };

  const clearCart = () => {
    writeCart([]);
    setCart([]);
    toast.success("Carrito vaciado");
  };

  const goShopping = () => navigate("/");

  /* === Checkout (comprar todo) === */
  const FLOW_BASE = import.meta.env.VITE_FLOW_BASE || "";
  const startCartPayment = async () => {
    if (!user?.email) {
      toast.error("Inicia sesión para completar la compra.");
      navigate("/login");
      return;
    }
    if (rows.length === 0) {
      toast.error("Tu carrito está vacío.");
      return;
    }
    if (!allSameCurrency) {
      toast.error("Hay monedas mezcladas. Separa la compra por moneda.");
      return;
    }
    const notBuyable = rows.filter((r) => !r.canBuy);
    if (notBuyable.length > 0) {
      toast.error("Algunos ítems no se pueden comprar ahora. Revisa el carrito.");
      return;
    }

    try {
      setPaying(true);
      const orderId = `CART-${Date.now()}`.slice(0, 45);
      const subject = `Carrito GoUp • ${rows.length} ítem(s)`;
      const currency = rows[0].currency || "CLP";

      const subI = rows.reduce((acc, r) => acc + (Math.round(r.priceNow || 0) * (r.item.qty || 0)), 0);
      const feeI = Math.round(subI * SERVICE_FEE_RATE);
      const totI = subI + feeI;

      const amount = String(totI);

      const returnUrl = new URL(
        `/pago/retorno?order=${encodeURIComponent(orderId)}`,
        window.location.origin
      ).toString();
      const confirmUrl = import.meta.env.VITE_PUBLIC_CONFIRM_URL as string;
      if (!confirmUrl || !/^https:\/\/.*ngrok-free\.app\/api\/flow\/webhook$/.test(confirmUrl)) {
        toast.error("Falta VITE_PUBLIC_CONFIRM_URL (ngrok) para confirmar el pago.");
        return;
      }
      const createUrl = `${String(FLOW_BASE).replace(/\/$/, "")}/api/flow/create`;

      const itemsMeta = rows.map((r) => ({
        eventId: r.item.eventId,
        eventName: r.item.eventName,
        eventImage: r.item.eventImage || null,
        eventStart: r.item.eventStart || null,
        eventEnd: r.item.eventEnd || null,
        ticketId: r.item.ticketId,
        ticketName: r.item.ticketName,
        ticketPath:
          r.item.ticketPath ||
          (r.ticket?.id ? `evento/${r.item.eventId}/ticketTypes/${r.ticket.id}` : null),
        qty: r.item.qty,
        price: Math.round(r.priceNow || 0),
        currency: r.currency,
      }));

      const first = rows[0];

      const body = {
        orderId,
        subject,
        currency,
        amount,
        email: user.email,
        returnUrl,
        confirmUrl,
        // compat antiguos campos singulares:
        eventId: first.item.eventId,
        ticketId: first.item.ticketId,
        ticketName: first.item.ticketName,
        ticketPath:
          first.item.ticketPath ||
          (first.ticket?.id ? `evento/${first.item.eventId}/ticketTypes/${first.ticket.id}` : null),
        ticketQty: first.item.qty,
        // full cart
        items: itemsMeta,
        // desglose
        subtotal: subI,
        serviceFee: feeI,
        serviceFeeRate: SERVICE_FEE_RATE,
        buyerUid: user?.uid || null,
        buyerName: (user as any)?.displayName || null,
      };

      const res = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Flow create error:", data);
        toast.error(data?.error || "No se pudo iniciar el pago.");
        return;
      }

      const payUrl = data.redirectUrl;
      if (!payUrl || !/^https?:\/\//i.test(payUrl)) {
        toast.error("No se recibió una URL válida de pago.");
        return;
      }

      window.location.assign(payUrl);
    } catch (e) {
      console.error(e);
      toast.error("Error iniciando el pago del carrito.");
    } finally {
      setPaying(false);
    }
  };

  /* === Render === */
  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-8">Cargando carrito…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Tu carrito</h1>
        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 text-sm"
            onClick={goShopping}
          >
            Seguir comprando
          </button>
          {cart.length > 0 && (
            <button
              className="px-3 py-2 rounded-md bg-rose-600/80 hover:bg-rose-500 text-sm"
              onClick={clearCart}
            >
              Vaciar carrito
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <p className="text-white/80">Tu carrito está vacío.</p>
          <div className="mt-3">
            <Link to="/" className="text-[#cbb3ff] underline">
              Explorar eventos
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          {/* Lista */}
          <div className="space-y-4">
            {rows.map((r, i) => {
              const fmtRow = makeCurrency(r.currency);
              const rowSub = rowSubtotalInt(r);
              const eventUrl = `/event/${r.item.eventId}`;
              return (
                <div
                  key={`${r.item.eventId}-${r.item.ticketId}-${i}`}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4 flex items-center gap-4"
                >
                  <figure className="w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0">
                    {r.item.eventImage ? (
                      <img
                        src={r.item.eventImage}
                        alt={r.item.eventName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-xs text-white/60">Evento</div>
                    )}
                  </figure>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={eventUrl} className="font-semibold hover:underline">
                          {r.item.eventName}
                        </Link>
                        <p className="text-sm text-white/70 truncate">
                          {r.item.ticketName}
                        </p>
                        <div className="mt-1 text-xs text-white/60">
                          {r.warnings.map((w, idx) => (
                            <span key={idx} className="inline-block mr-2">
                              • {w}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-white/70">Precio</div>
                        <div className="font-semibold">{fmtRow.format(Math.round(r.priceNow || r.item.price))}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white/70">Cantidad</span>
                        <select
                          className="px-2 py-1 rounded-md bg-black/40 border border-white/15 text-sm"
                          value={r.item.qty}
                          onChange={(e) => setQty(r, Number(e.target.value) || 1)}
                        >
                          {Array.from({ length: r.maxQty }).map((_, idx) => (
                            <option key={idx + 1} value={idx + 1}>
                              {idx + 1}
                            </option>
                          ))}
                        </select>
                        <button
                          className="text-sm px-3 py-1 rounded-md bg-white/10 hover:bg-white/15"
                          onClick={() => removeItem(r)}
                        >
                          Eliminar
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="text-sm text-white/70">Subtotal</div>
                        <div className="text-lg font-extrabold tracking-tight">
                          {fmtRow.format(rowSub)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resumen */}
          <aside className="space-y-4">
            {!allSameCurrency && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                Hay tickets con <b>moneda distinta</b>. Finaliza la compra por moneda.
              </div>
            )}
            {!allBuyable && (
              <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                Hay ítems que no se pueden comprar ahora. Ajusta cantidades o elimina los ítems marcados.
              </div>
            )}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="font-semibold text-[#cbb3ff] mb-3">Resumen</h2>

              <div className="flex items-center justify-between text-sm mb-1">
                <span>Ítems</span>
                <span>{rows.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm mb-4">
                <span>Cantidad total</span>
                <span>{rows.reduce((a, r) => a + (r.item.qty || 0), 0)}</span>
              </div>

              <div className="flex items-center justify-between text-base">
                <span className="text-white/80">Subtotal</span>
                <span className="text-lg font-semibold">
                  {fmt.format(subtotalInt || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1 mb-3">
                <span className="text-white/70">Cargo por servicio (12%)</span>
                <span className="font-medium">
                  {fmt.format(serviceFeeInt || 0)}
                </span>
              </div>

              <div className="flex items-center justify-between text-base border-t border-white/10 pt-3">
                <span className="text-white/85">Total</span>
                <span className="text-2xl font-extrabold tracking-tight">
                  {fmt.format(totalInt || 0)}
                </span>
              </div>

              <button
                className={`mt-4 w-full px-4 py-3 rounded-full font-semibold shadow ${
                  rows.length > 0 && allSameCurrency && allBuyable && !paying
                    ? "bg-[#f5e14c] text-black hover:brightness-95"
                    : "bg-white/20 text-white/60 cursor-not-allowed"
                }`}
                disabled={!(rows.length > 0 && allSameCurrency && allBuyable) || paying}
                onClick={startCartPayment}
              >
                {paying ? "Redirigiendo…" : "Comprar todo"}
              </button>

              <p className="mt-2 text-xs text-white/50">
                El total incluye el <b>cargo por servicio del 12%</b>. El pago se procesa vía Flow.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}