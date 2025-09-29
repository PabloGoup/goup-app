// src/pages/CartPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { Firestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, increment, collection } from "firebase/firestore";
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
const yyyymmdd = (d: Date = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
};

type FunnelStep = "views" | "carts" | "started" | "success";
async function bumpFunnel(eventId: string, step: FunnelStep, extra: Record<string, any> = {}) {
  // 1) Intento por servidor (recomendado)
  try {
    await fetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, step, ...extra }),
      credentials: 'include',
    });
    return;
  } catch (_) {
    // continuar con fallback
  }
  // 2) Fallback directo a Firestore (útil en dev/local si reglas bloquean)
  try {
    const dateKey = yyyymmdd();
    const evDoc = doc(firebaseDb as Firestore, "metrics_funnel", dateKey, "events", eventId);
    await setDoc(evDoc, { dateKey, eventId, updatedAt: serverTimestamp(), [step]: increment(1), ...extra }, { merge: true });
    const globalDoc = doc(firebaseDb as Firestore, "metrics_funnel", dateKey, "global", "global");
    await setDoc(globalDoc, { dateKey, updatedAt: serverTimestamp(), [step]: increment(1) }, { merge: true });
  } catch (e) {
    console.warn("No se pudo escribir métrica de embudo (fallback):", e);
  }
}
// Guarda una marca en sessionStorage para evitar duplicados por recarga
function guardOnce(key: string, fn: () => Promise<void> | void) {
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  void fn();
}

const withinWindow = (start?: string | null, end?: string | null) => {
  const now = Date.now();
  const a = start ? new Date(start).getTime() : -Infinity;
  const b = end ? new Date(end).getTime() : Infinity;
  return now >= a && now <= b;
};

/* ====== UI helpers ====== */
const inputBase = "w-full px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#FE8B02]/40 focus:border-[#FE8B02]/50 placeholder-white/40";
const selectBase = inputBase + " appearance-none";
const labelBase = "text-sm block text-white/80 mb-1";
const cardBase = "rounded-xl border border-white/10 bg-white/[0.03] p-4";


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

// ====== Pre-checkout profile form types/helpers ======
type ProfileForm = {
  nombre: string;
  rut: string;
  direccion: string;
  telefono?: string;
  email: string;
  sexo: "Masculino" | "Femenino" | "Otro" | "";
  fecha_nacimiento: string; // YYYY-MM-DD
};
const emptyProfile: ProfileForm = {
  nombre: "",
  rut: "",
  direccion: "",
  telefono: "",
  email: "",
  sexo: "",
  fecha_nacimiento: "",
};
const toYYYYMMDD = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (typeof v === "object" && (v as any)?.seconds) {
    const d = new Date((v as any).seconds * 1000);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${dd}`;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate() + 0).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
};

// ====== Attendees (clientes 2+) ======
type Attendee = {
  nombre: string;
  edad?: number | "";
  fecha_nacimiento?: string; // YYYY-MM-DD
  rut?: string;
  telefono?: string;
  sexo?: "Masculino" | "Femenino" | "Otro" | "";
  correo?: string;
  // runtime only
  _eventId?: string;
  _ticketId?: string;
};
const emptyAttendee = (): Attendee => ({
  nombre: "",
  edad: "",
  fecha_nacimiento: "",
  rut: "",
  telefono: "",
  sexo: "",
  correo: "",
});
function parseAgeFromDOB(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}
function ageBucket(age: number): "lt18" | "18_24" | "25_34" | "35_44" | "45_54" | "55p" {
  if (age < 18) return "lt18";
  if (age <= 24) return "18_24";
  if (age <= 34) return "25_34";
  if (age <= 44) return "35_44";
  if (age <= 54) return "45_54";
  return "55p";
}

export default function CartPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [cart, setCart] = useState<CartItem[]>(() => readCart());
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentModal, setPaymentModal] = useState<{open: boolean; status: 'success' | 'rejected' | null}>({ open: false, status: null });

  // ====== Pre-checkout: confirmación de datos del comprador ======
  const [confirmOpen, setConfirmOpen] = useState(false);             // abre el formulario
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);     // confirma actualizar perfil
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const hasCart = useMemo(() => rows.length > 0, [rows.length]);

  // ====== Asistentes (clientes 2+) ======
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const totalTickets = useMemo(() => rows.reduce((acc, r) => acc + (r.item.qty || 0), 0), [rows]);
  useEffect(() => {
    const need = Math.max(0, totalTickets - 1);
    setAttendees((prev) => {
      if (prev.length === need) return prev;
      const next = [...prev];
      while (next.length < need) next.push(emptyAttendee());
      while (next.length > need) next.pop();
      return next;
    });
  }, [totalTickets]);

  // Cargar datos de usersWeb/{uid} si existen para autocompletar
  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      try {
        setProfileLoading(true);
        const ref = doc(firebaseDb as Firestore, "usersWeb", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d: any = snap.data() || {};
          setProfile({
            nombre: d.nombre || d.name || (user as any)?.displayName || "",
            rut: d.rut || "",
            direccion: d.direccion || d.address || "",
            telefono: d.telefono || d.phone || "",
            email: d.email || user.email || "",
            sexo: d.sexo || d.gender || "",
            fecha_nacimiento: toYYYYMMDD(d.fecha_nacimiento || d.birthdate || d.birthday),
          });
        } else {
          setProfile((p) => ({
            ...p,
            email: user.email || "",
            nombre: (user as any)?.displayName || "",
            telefono: "",
          }));
        }
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [user?.uid]);

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
      try {
        const uniqueEventIds = Array.from(new Set(next.map(n => n.item.eventId)));
        uniqueEventIds.forEach((eid) => {
          guardOnce(`funnel:cart:${eid}`, () => bumpFunnel(eid, "carts"));
        });
      } catch {}
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
  async function bumpFunnelDemographics(eventId: string, sexo?: string, edad?: number | null) {
    try {
      const dateKey = yyyymmdd();
      const evDoc = doc(firebaseDb as Firestore, "metrics_funnel", dateKey, "events", eventId);
      const updates: Record<string, any> = {};
      const g = (sexo || "").toLowerCase();
      if (g === "femenino" || g === "f") updates["gender_F"] = increment(1);
      else if (g === "masculino" || g === "m") updates["gender_M"] = increment(1);
      else if (sexo) updates["gender_O"] = increment(1);
      if (typeof edad === "number") {
        const b = ageBucket(edad);
        const map: Record<string, string> = {
          lt18: "age_lt18",
          "18_24": "age_18_24",
          "25_34": "age_25_34",
          "35_44": "age_35_44",
          "45_54": "age_45_54",
          "55p": "age_55p",
        };
        updates[map[b]] = increment(1);
      }
      if (Object.keys(updates).length > 0) {
        await setDoc(evDoc, updates, { merge: true });
      }
    } catch (e) {
      console.warn("No se pudo escribir demografía (metrics_funnel):", e);
    }
  }
  function minAgeForEvent(ev?: EventNew | null): number | null {
    const any: any = ev || {};
    if (typeof any.edadMinima === "number") return any.edadMinima;
    if (any.mayoresDe18 === true || any.mayores18 === true) return 18;
    return null;
  }
  // Webpay: usamos un endpoint del backend propio
  const startCartPaymentCore = async () => {
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
      // Webpay: usamos un endpoint del backend propio
      const createUrl = "/api/payments/webpay/init"; // mismo origen (Vite proxy / Vercel)

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
        // asistentes nominativos (clientes 2+)
        attendees: (window as any).__goup_attendees || [],
        demographics: (window as any).__goup_demographics || null,
        // desglose
        subtotal: subI,
        serviceFee: feeI,
        serviceFeeRate: SERVICE_FEE_RATE,
        buyerUid: user?.uid || null,
        buyerName: (user as any)?.displayName || null,
        buyerRut: profile.rut || null,
        buyerPhone: profile.telefono || null,
      };

      try {
        const orderKey = `funnel:started:${orderId}`;
        if (!sessionStorage.getItem(orderKey)) {
          sessionStorage.setItem(orderKey, "1");
          const uniqueEventIds = Array.from(new Set(itemsMeta.map(i => i.eventId)));
          await Promise.all(uniqueEventIds.map(eid => bumpFunnel(eid, "started", { orderId })));
          // Marca para reconstruir estado en retorno
          sessionStorage.setItem("goup:lastPaymentStatus", "started");
        }
      } catch {}

      const res = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Webpay init error:", data);
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

  // Al apretar "Comprar todo" primero mostramos el formulario de confirmación
  const onBuyClick = () => {
    if (!user?.email) {
      toast.error("Inicia sesión para completar la compra.");
      navigate("/login");
      return;
    }
    if (rows.length === 0) {
      toast.error("Tu carrito está vacío.");
      return;
    }
    setConfirmOpen(true);
  };

  // Enviar formulario -> confirmar actualización -> guardar en usersWeb y pagar
  const submitProfileAndPay = async () => {
    {
      // validaciones mínimas del comprador
      if (!profile.nombre?.trim()) { toast.error("Falta confirmar tu nombre completo."); return; }
      if (!profile.email?.trim()) { toast.error("Falta tu correo."); return; }

      // Construir slots de tickets (uno por entrada)
      const ticketSlots: { eventId: string; ticketId: string; ev: EventNew | null }[] = [];
      rows.forEach(r => {
        for (let i = 0; i < (r.item.qty || 0); i++) {
          ticketSlots.push({ eventId: r.item.eventId, ticketId: r.item.ticketId, ev: r.event || null });
        }
      });

      // Cliente 1 (comprador) usa el primer slot
      const extraSlots = ticketSlots.slice(1);
      if (attendees.length !== extraSlots.length) {
        toast.error("Faltan datos de algunos asistentes.");
        return;
      }

      // Validar cada asistente adicional (edad mínima cuando aplique)
      for (let i = 0; i < attendees.length; i++) {
        const at = attendees[i];
        const slot = extraSlots[i];
        const minA = minAgeForEvent(slot?.ev);
        // edad: usa campo edad, si no fecha de nacimiento
        const ageFromDOB = parseAgeFromDOB(at.fecha_nacimiento || "");
        const age = typeof at.edad === "number" ? at.edad : (ageFromDOB ?? null);
        if (!at.nombre?.trim()) { toast.error(`Falta nombre del cliente ${i + 2}.`); return; }
        if (minA != null && (age == null || age < minA)) {
          toast.error(`El cliente ${i + 2} no cumple la edad mínima (${minA}+).`);
          return;
        }
        // Guardar asignación temporal hacia ticket/evento
        at._eventId = slot?.eventId;
        at._ticketId = slot?.ticketId;
      }

      setConfirmSaveOpen(true);
    }
  };

  const confirmUpdateAndPay = async () => {
    if (!user?.uid) return;
    try {
      setProfileSubmitting(true);
      // Actualizar/crear usersWeb/{uid} con merge
      const ref = doc(firebaseDb as Firestore, "usersWeb", user.uid);
      const payload: any = {
        nombre: profile.nombre || null,
        rut: profile.rut || null,
        direccion: profile.direccion || null,
        telefono: profile.telefono || null,
        email: profile.email || user.email || null,
        sexo: profile.sexo || null,
        fecha_nacimiento: profile.fecha_nacimiento || null,
        updatedAt: serverTimestamp(),
        uid: user.uid,
      };
      await setDoc(ref, payload, { merge: true });
      setConfirmSaveOpen(false);
      setConfirmOpen(false);
      // Demografía (buyer + asistentes 2+) -> la enviamos al backend para que escriba con paidAt real
      try {
        const ticketSlots: { eventId: string; ticketId: string; ev: EventNew | null }[] = [];
        rows.forEach(r => {
          for (let i = 0; i < (r.item.qty || 0); i++) {
            ticketSlots.push({ eventId: r.item.eventId, ticketId: r.item.ticketId, ev: r.event || null });
          }
        });
        // Buyer (slot 0)
        const buyerAge = parseAgeFromDOB(profile.fecha_nacimiento || "");
        const buyerDemo = {
          sexo: profile.sexo || null,
          edad: buyerAge,
          eventId: ticketSlots[0]?.eventId || null,
          rut: profile.rut || null,
          telefono: profile.telefono || null,
        };
        // Clientes 2+
        const attendeesDemo = attendees.map((at, i) => {
          const slot = ticketSlots[i + 1];
          const ageFromDOB = parseAgeFromDOB(at.fecha_nacimiento || "");
          const age = typeof at.edad === "number" ? at.edad : (ageFromDOB ?? null);
          return {
            sexo: at.sexo || null,
            edad: age,
            eventId: slot?.eventId || null,
          };
        });
        (window as any).__goup_demographics = { buyer: buyerDemo, attendees: attendeesDemo };
      } catch (e) {
        console.warn("No se pudo preparar demografía para backend:", e);
        (window as any).__goup_demographics = null;
      }

      // Empaquetar asistentes (nominativos) para que el backend los asigne a los tickets
      (window as any).__goup_attendees = attendees.map(a => ({
        nombre: a.nombre,
        edad: typeof a.edad === "number" ? a.edad : undefined,
        fecha_nacimiento: a.fecha_nacimiento || undefined,
        rut: a.rut || undefined,
        telefono: a.telefono || undefined,
        sexo: a.sexo || undefined,
        correo: a.correo || undefined,
        eventId: a._eventId,
        ticketId: a._ticketId,
      }));

      // Continuar al pago
      await startCartPaymentCore();
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron guardar tus datos. Intenta nuevamente.");
    } finally {
      setProfileSubmitting(false);
    }
  };

  // Detectar resultado de pago (desde query, state o sessionStorage) y mostrar modal
  function resolvePaymentStatus(search: string, state: any): 'success' | 'rejected' | null {
    const sp = new URLSearchParams(search || '');
    const fromQuery = (
      sp.get('status') || sp.get('pago') || sp.get('flow') || sp.get('payment') || ''
    ).toLowerCase();

    const fromState = (state?.paymentStatus || '').toLowerCase();
    const fromStore = (sessionStorage.getItem('goup:lastPaymentStatus') || '').toLowerCase();

    const raw = fromQuery || fromState || fromStore;

    if (['success', 'ok', 'exito', 'exitoso', 'approved', 'paid'].includes(raw)) return 'success';
    if (['rejected', 'fail', 'failed', 'rechazado', 'denied', 'canceled', 'cancelled'].includes(raw)) return 'rejected';
    return null;
  }

  useEffect(() => {
    const status = resolvePaymentStatus(location.search, (location as any).state);
    if (status) {
      sessionStorage.setItem('goup:lastPaymentStatus', status);
    }
    if (!status) return;

    (async () => {
      // limpiar marcas para que no se repita
      sessionStorage.removeItem('goup:lastPaymentStatus');

      if (status === 'success') {
        try {
          // Si venimos de un flujo de compra, marcar success por evento, una sola vez por orderId si está disponible.
          const orderId = (new URLSearchParams(location.search)).get("order") || "unknown";
          const guard = `funnel:success:${orderId}`;
          if (!sessionStorage.getItem(guard)) {
            sessionStorage.setItem(guard, "1");
            const uniqueEventIds = Array.from(new Set(cart.map(c => c.eventId)));
            await Promise.all(uniqueEventIds.map(eid => bumpFunnel(eid, "success", { orderId })));
          }
        } catch {}
        // Vaciar carrito en éxito (silencioso)
        writeCart([]);
        setCart([]);
        setPaymentModal({ open: true, status: 'success' });
      } else {
        setPaymentModal({ open: true, status: 'rejected' });
      }

      // limpiar query de la URL para evitar re-disparo
      const url = new URL(window.location.href);
      ['status','pago','flow','payment','webpay'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.toString());
    })();
  }, [location.search, (location as any).state]);

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
                onClick={onBuyClick}
              >
                {paying ? "Redirigiendo…" : "Comprar todo"}
              </button>

              <p className="mt-2 text-xs text-white/50">
                El total incluye el <b>cargo por servicio del 12%</b>. El pago se procesa vía Webpay.
              </p>
            </div>
          </aside>
        </div>
      )}
    {/* Payment Result Modal */}
    {paymentModal.open && (
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm grid place-items-center">
        <div className="w-[92vw] max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl">
          {paymentModal.status === 'success' ? (
            <>
              <h3 className="text-xl font-bold">¡Pago exitoso!</h3>
              <p className="mt-2 text-white/80">Tu pago fue exitoso. Entra a <b>Mis tickets</b> para ver más detalles.</p>
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    ['status','pago','flow','payment','webpay'].forEach((k) => url.searchParams.delete(k));
                    window.history.replaceState({}, '', url.toString());
                    setPaymentModal({ open: false, status: null });
                  }}
                >
                  Cerrar
                </button>
                <Link
                  to="/mis-tickets"
                  className="px-3 py-2 rounded-md bg-[#FE8B02] hover:bg-[#7b1fe0] font-semibold"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    ['status','pago','flow','payment','webpay'].forEach((k) => url.searchParams.delete(k));
                    window.history.replaceState({}, '', url.toString());
                    setPaymentModal({ open: false, status: null });
                  }}
                >
                  Ir a mis tickets
                </Link>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold">Pago rechazado</h3>
              <p className="mt-2 text-white/80">Tu pago fue rechazado. Inténtalo nuevamente.</p>
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    ['status','pago','flow','payment','webpay'].forEach((k) => url.searchParams.delete(k));
                    window.history.replaceState({}, '', url.toString());
                    setPaymentModal({ open: false, status: null });
                  }}
                >
                  Cerrar
                </button>
                <button
                  className="px-3 py-2 rounded-md bg-[#f5e14c] text-black font-semibold hover:brightness-95"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    ['status','pago','flow','payment','webpay'].forEach((k) => url.searchParams.delete(k));
                    window.history.replaceState({}, '', url.toString());
                    setPaymentModal({ open: false, status: null });
                  }}
                >
                  Intentar nuevamente
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}

    {/* ====== Pre-checkout: Confirmación de datos del comprador ====== */}
    {confirmOpen && (
      <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm grid place-items-center">
        <div className="w-[96vw] max-w-3xl rounded-2xl border border-white/10 bg-neutral-900 p-0 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/10 bg-white/[0.02]">
            <h3 className="text-lg md:text-xl font-bold">Confirma tus datos antes de pagar</h3>
            <p className="text-white/70 text-xs md:text-sm mt-1">Estos datos nos ayudan a mejorar tu experiencia y obtener mejores métricas.</p>
          </div>

          {/* Body */}
          <div className="p-4 md:p-5 space-y-4 md:space-y-5 max-h-[70vh] overflow-auto">
            {/* Buyer (Cliente 1) primero */}
            <section className={cardBase}>
              <h4 className="font-semibold">Tus datos (Cliente 1)</h4>
              <div className="grid sm:grid-cols-2 gap-3 md:gap-4 mt-3">
                <label className="text-sm">
                  <span className={labelBase}>Nombre completo</span>
                  <input className={inputBase} value={profile.nombre} onChange={(e)=>setProfile({...profile,nombre:e.target.value})} placeholder="Tu nombre completo" />
                </label>
                <label className="text-sm">
                  <span className={labelBase}>RUT</span>
                  <input className={inputBase} value={profile.rut} onChange={(e)=>setProfile({...profile,rut:e.target.value})} placeholder="12.345.678-9" />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className={labelBase}>Dirección</span>
                  <input className={inputBase} value={profile.direccion} onChange={(e)=>setProfile({...profile,direccion:e.target.value})} placeholder="Calle, número, comuna" />
                </label>
                <label className="text-sm">
                  <span className={labelBase}>Teléfono</span>
                  <input
                    className={inputBase}
                    value={profile.telefono || ""}
                    onChange={(e) => setProfile({ ...profile, telefono: e.target.value })}
                    placeholder="+56 9 1234 5678"
                  />
                </label>
                <label className="text-sm">
                  <span className={labelBase}>Correo</span>
                  <input type="email" className={inputBase} value={profile.email} onChange={(e)=>setProfile({...profile,email:e.target.value})} placeholder="correo@ejemplo.com" />
                </label>
                <label className="text-sm">
                  <span className={labelBase}>Sexo</span>
                  <select className={selectBase} value={profile.sexo} onChange={(e)=>setProfile({...profile,sexo:e.target.value as any})}>
                    <option value="">Selecciona</option>
                    <option value="Femenino">Femenino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Otro">Otro / Prefiero no decir</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className={labelBase}>Fecha de nacimiento</span>
                  <input type="date" className={inputBase} value={profile.fecha_nacimiento} onChange={(e)=>setProfile({...profile,fecha_nacimiento:e.target.value})} />
                </label>
              </div>
            </section>

            {/* Attendees (clientes 2+) después */}
            {attendees.length > 0 && (
              <section className={cardBase}>
                <h4 className="font-semibold">Datos de otros asistentes</h4>
                <p className="text-xs text-white/60">Completa los datos de cada entrada adicional.</p>
                <div className="mt-3 space-y-4">
                  {attendees.map((a, idx) => (
                    <div key={idx} className="rounded-lg border border-white/10 p-3 md:p-4 bg-black/30">
                      <div className="text-xs text-white/60 mb-2">Cliente {idx + 2}</div>
                      <div className="grid sm:grid-cols-2 gap-3 md:gap-4">
                        <label className="text-sm">
                          <span className={labelBase}>Nombre completo</span>
                          <input className={inputBase} value={a.nombre} onChange={(e)=>setAttendees(prev=>prev.map((x,i)=>i===idx?{...x,nombre:e.target.value}:x))} placeholder="Nombre y apellido" />
                        </label>
                        <label className="text-sm">
                          <span className={labelBase}>Edad</span>
                          <input type="number" min={0} className={inputBase} value={a.edad===""?"":a.edad} onChange={(e)=>{
                            const v = e.target.value?Number(e.target.value):"" as any;
                            setAttendees(prev=>prev.map((x,i)=>i===idx?{...x,edad:v}:x));
                          }} placeholder="Ej: 25" />
                        </label>
                        <label className="text-sm">
                          <span className={labelBase}>Fecha de nacimiento</span>
                          <input type="date" className={inputBase} value={a.fecha_nacimiento || ""} onChange={(e)=>setAttendees(prev=>prev.map((x,i)=>i===idx?{...x,fecha_nacimiento:e.target.value}:x))} />
                        </label>
                        <label className="text-sm">
                          <span className={labelBase}>RUT</span>
                          <input className={inputBase} value={a.rut || ""} onChange={(e)=>setAttendees(prev=>prev.map((x,i)=>i===idx?{...x,rut:e.target.value}:x))} placeholder="12.345.678-9" />
                        </label>
                        <label className="text-sm">
                          <span className={labelBase}>Teléfono</span>
                          <input className={inputBase} value={a.telefono || ""} onChange={(e)=>setAttendees(prev=>prev.map((x,i)=>i===idx?{...x,telefono:e.target.value}:x))} placeholder="+56 9 1234 5678" />
                        </label>
                        <label className="text-sm">
                          <span className={labelBase}>Sexo</span>
                          <select className={selectBase} value={a.sexo || ""} onChange={(e)=>setAttendees(prev=>prev.map((x,i)=>i===idx?{...x,sexo:e.target.value as any}:x))}>
                            <option value="">Selecciona</option>
                            <option value="Femenino">Femenino</option>
                            <option value="Masculino">Masculino</option>
                            <option value="Otro">Otro / Prefiero no decir</option>
                          </select>
                        </label>
                        <label className="text-sm sm:col-span-2">
                          <span className={labelBase}>Correo</span>
                          <input type="email" className={inputBase} value={a.correo || ""} onChange={(e)=>setAttendees(prev=>prev.map((x,i)=>i===idx?{...x,correo:e.target.value}:x))} placeholder="correo@ejemplo.com" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Footer (sticky) */}
          <div className="px-4 md:px-5 py-3 border-t border-white/10 bg-neutral-900/95 flex gap-2 justify-end sticky bottom-0">
            <button className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15" onClick={()=>setConfirmOpen(false)} disabled={profileSubmitting}>Volver</button>
            <button className="px-4 py-2 rounded-lg bg-[#FE8B02] hover:bg-[#7b1fe0] font-semibold" onClick={submitProfileAndPay} disabled={profileSubmitting}>Continuar al pago</button>
          </div>
        </div>
      </div>
    )}

    {/* Confirmación para actualizar el perfil */}
    {confirmSaveOpen && (
      <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm grid place-items-center">
        <div className="w-[92vw] max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
          <h4 className="text-lg font-bold">Actualizar tu perfil</h4>
          <p className="mt-2 text-sm text-white/80">
            Estos datos serán actualizados en tu perfil. ¿Deseas confirmar o volver?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15"
              onClick={() => setConfirmSaveOpen(false)}
              disabled={profileSubmitting}
            >
              Volver
            </button>
            <button
              className="px-3 py-2 rounded-md bg-[#f5e14c] text-black font-semibold hover:brightness-95"
              onClick={confirmUpdateAndPay}
              disabled={profileSubmitting}
            >
              Confirmar y pagar
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
              <p className="mt-2 text-xs text-white/60">
                El pago se procesa vía Webpay.
              </p>