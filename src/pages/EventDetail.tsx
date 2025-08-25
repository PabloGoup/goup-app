// src/pages/EventDetail.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  RHFInput,
  RHFSelect,
  RHFTextarea,
  RHFCheckboxGroup,
  RHFFile,
} from "@/components/form/control";

import {
  Firestore,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { db as firebaseDb } from "@/lib/firebase";

import { SiWhatsapp, SiFacebook, SiX } from "react-icons/si";
import { MdOutlineMail } from "react-icons/md";
import { FiShare2 } from "react-icons/fi";

import { useAuth } from "@/auth/AuthContext";

// ▼ replicas del schema de creación para reutilizar el mismo form en edición
import { eventSchema } from "@/lib/schemas";
import NewVenueModal from "@/components/venues/NewVenueModal";
import VenueCombo from "@/components/venues/VenueComboBox";
import { LineupFields } from "@/components/form/LineupFields";

/* ===================== Config ===================== */

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const CART_ROUTE = "/carrito";

/* ==== Carrito (localStorage) ==== */
type CartItem = {
  eventId: string;
  eventName: string;
  eventImage?: string | null;
  eventStart?: string | null; // ISO inicio
  eventEnd?: string | null;   // ISO término
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
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
}
function writeCart(items: CartItem[]) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch {}
}
function addToCart(item: CartItem) {
  const items = readCart();
  const idx = items.findIndex(
    (x) =>
      x.eventId === item.eventId &&
      x.ticketId === item.ticketId &&
      x.price === item.price &&
      x.currency === item.currency
  );
  if (idx >= 0) {
    const nextQty = Math.min(items[idx].qty + item.qty, 99);
    items[idx] = { ...items[idx], qty: nextQty, addedAt: Date.now() };
  } else {
    items.push(item);
  }
  writeCart(items);
}

function countCart(items?: CartItem[]) {
  const arr = items ?? readCart();
  return arr.reduce((acc, it) => acc + Math.max(1, Number(it.qty || 1)), 0);
}

function CartIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M7 4h-2a1 1 0 0 0 0 2h1.28l2.28 9.39A3 3 0 0 0 11.47 18h6.41a1 1 0 1 0 0-2h-6.41a1 1 0 0 1-.97-.76L10.2 14h7.54a3 3 0 0 0 2.91-2.32l1.02-4.08A1 1 0 0 0 20.72 6H8.21l-.36-1.42A2 2 0 0 0 7 4ZM9 20a1.75 1.75 0 1 1 0-3.5A1.75 1.75 0 0 1 9 20Zm8.5 0A1.75 1.75 0 1 1 17.5 16.5 1.75 1.75 0 0 1 17.5 20Z"/>
    </svg>
  );
}

/* ==== Helpers de fecha ==== */
const fmtDateLong = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch { return iso; }
};
const fmtDateShort = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-CL") : "—");
const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : "");

/* ---- Bool / VIP / etc ---- */
const asBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "si" || s === "sí" || s === "true" || s === "1";
};
const vipToCount = (v: unknown): number => {
  const s = String(v ?? "");
  if (s.toLowerCase() === "no" || s === "" || s === "0") return 0;
  if (s.toLowerCase().includes("más de")) return 6;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const normalizeGeneros = (g: string[] | string | null | undefined): string[] => {
  if (Array.isArray(g)) return g;
  if (typeof g === "string") {
    const list = g.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    return list.length ? list : g ? [g] : [];
  }
  return [];
};
const countToVipSelect = (n: number | null | undefined): string => {
  if (!n || n <= 0) return "No";
  if (n > 5) return "Más de 5";
  return String(n);
};

function combineDateTime(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(d.getTime()) ? null : d;
}

/* -------- Firestore shapes -------- */
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
type ClubDoc = {
  nombre: string;
  ciudad?: string | null;
  pais?: string | null;
  direccion?: string | null;
  latitud?: number | null;
  longitud?: number | null;
};
type EventNew = {
  uid_usersWeb: string;
  nombre: string;
  tipo: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  clubId: string;
  capacidad?: string | null;
  presupuesto?: string | null;
  promotor?: string | null;
  telefono?: string | null;
  email?: string | null;
  descripcion?: string | null;
  generos?: string[] | null;
  edad?: number | null;
  dress_code?: string | null;
  tieneLineup?: boolean;
  cantidadDJs?: number | null;
  djs?: string[] | null;
  flyer?: string | null;
  imgSec?: string | null;
  venderTickets?: boolean;
  estado?: "publicado" | "draft" | "archivado";
  moneda?: "CLP" | "USD";
  perUserLimit?: number;
  ventaAbre?: string | null;
  ventaCierra?: string | null;
  // Compatibilidad con campos de VIP/reservas
  tieneVip?: boolean;
  cantidadZonasVip?: number | null;
  aceptaReservas?: boolean | null;
};
type EventLegacy = {
  id_evento?: string;
  uid_usersWeb?: string;
  nombre: string;
  tipo: string;
  fecha: string;
  horaInicio: string | null;
  horaCierre: string | null;
  capacidad: string | null;
  presupuesto: string | null;
  promotor: string | null;
  telefono: string | null;
  email: string | null;
  desc: string | null;
  generos: string[] | string | null;
  edad: number | null;
  dress_code?: string | null;
  vip?: boolean | null;
  cantidadZonasVip: number | null;
  aceptaReservas: boolean | null;
  lineup: boolean | null;
  cantidadDJs: number | null;
  djs: string[] | null;
  flyer: string | null;
  imgSec: string | null;
};

/* ===================== Form de EDICIÓN (mismo schema que crear) ===================== */
const extraSchema = z.object({
  clubId: z.string().min(1, "Debes seleccionar una localidad"),
  venderTickets: z.boolean().default(false),
  perUserLimit: z
    .number({ invalid_type_error: "Tope inválido" })
    .int()
    .nonnegative()
    .or(
      z
        .string()
        .transform((v) => (v === "" ? 0 : Number(v)))
        .refine((n) => Number.isFinite(n) && n >= 0, "Tope inválido")
    ),
  ventaAbre: z.string().optional().or(z.literal("")),
  ventaCierra: z.string().optional().or(z.literal("")),
  fechaFin: z.string().min(1, "Debes indicar la fecha de término"),
});

type ExtraSaleFields = z.infer<typeof extraSchema>;
export type EventFormValues = z.infer<typeof eventSchema> & ExtraSaleFields;

const resolver = zodResolver(
  (eventSchema as unknown as z.ZodTypeAny).and(extraSchema)
) as unknown as Resolver<EventFormValues>;

/* ===================== UI pequeños ===================== */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border /10 bg-white/[0.03] backdrop-blur p-5">
      <h3 className="font-semibold text-[#cbb3ff] mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function KeyRow({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <p className="text-sm /80 flex items-baseline justify-between gap-3">
      <span className="/60">{k}</span>
      <span className="text-right">{v ?? "—"}</span>
    </p>
  );
}
function Badge({ label }: { label: string }) {
  return (
    <span className="text-xs px-2 py-1 rounded bg-[#8e2afc]/20 text-[#e4d7ff] border border-[#8e2afc]/30">
      {label}
    </span>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-[#cbb3ff]">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/* ——— Estado de compra por ticket ——— */
function getTicketState(ev: EventNew | null | undefined, t: TicketTypeDoc) {
  const now = Date.now();
  const abre = ev?.ventaAbre ? new Date(ev.ventaAbre).getTime() : -Infinity;
  const cierra = ev?.ventaCierra ? new Date(ev.ventaCierra).getTime() : Infinity;
  const dentroDeVenta = now >= abre && now <= cierra;
  const disponible = (t.stockDisponible ?? 0) > 0 && t.activo;
  const vender = !!ev?.venderTickets;
  const puedeComprar = vender && dentroDeVenta && disponible;

  let badge: { label: string; tone: "ok" | "warn" | "off" } = { label: "Disponible", tone: "ok" };
  if (!t.activo) badge = { label: "Inactivo", tone: "off" };
  else if ((t.stockDisponible ?? 0) <= 0) badge = { label: "Agotado", tone: "off" };
  else if (!dentroDeVenta) badge = { label: "Fuera de ventana", tone: "warn" };

  return { puedeComprar, dentroDeVenta, disponible, badge };
}

/* ===================== Página ===================== */
export default function EventDetailPage() {
  const { slugOrId, id: idFromRoute } = useParams<{ slugOrId?: string; id?: string }>();
  const id = useMemo(() => {
    const raw = slugOrId ?? idFromRoute ?? "";
    if (!raw) return "";
    const parts = raw.split("-");
    return parts[parts.length - 1];
  }, [slugOrId, idFromRoute]);

  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Datos
  const [eventNew, setEventNew] = useState<(EventNew & { id: string }) | null>(null);
  const [eventLegacy, setEventLegacy] = useState<(EventLegacy & { id: string }) | null>(null);
  const [club, setClub] = useState<ClubDoc | null>(null);
  const [tickets, setTickets] = useState<TicketTypeDoc[]>([]);

  // Cantidades por tipo de ticket
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [cartQty, setCartQty] = useState<number>(() => countCart());
  const [lockModal, setLockModal] = useState(false);
  const getMaxQty = (t: TicketTypeDoc) => {
    const stock = Math.max(1, t.stockDisponible ?? 0);
    const perTicketLimit =
      Number(t.perUserLimit ?? 0) || Number(eventNew?.perUserLimit ?? 0) || 10;
    return Math.max(1, Math.min(stock, perTicketLimit));
  };

  // ====== FORM (mismo que crear) ======
  const methods = useForm<EventFormValues>({ resolver, mode: "onChange" });
  const generosOtroWatch = methods.watch("generosOtro");
  const venderTickets = methods.watch("venderTickets");
  const perUserLimit = methods.watch("perUserLimit");

  const [generosOtroLocal, setGenerosOtroLocal] = useState("");
  const [newVenueOpen, setNewVenueOpen] = useState(false);

  // ---------- Favoritos & Compartir ----------
  const [isFav, setIsFav] = useState<boolean>(() => (id ? localStorage.getItem(`fav:event:${id}`) === "1" : false));
  useEffect(() => { if (id) localStorage.setItem(`fav:event:${id}`, isFav ? "1" : "0"); }, [isFav, id]);

  const [shareOpen, setShareOpen] = useState(false);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); toast.success("Enlace copiado"); setShareOpen(false); }
    catch { toast.error("No se pudo copiar el enlace"); }
  };

  // ---------- Carga ----------
  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const evRef = doc(firebaseDb as Firestore, "evento", id);
        const evSnap = await getDoc(evRef);

        if (evSnap.exists()) {
          const ev = { id, ...(evSnap.data() as EventNew) };
          if (!alive) return;
          setEventNew(ev);

          // Prefill form con datos existentes (no dejar campos vacíos si hay data)
          const start = ev.fechaInicio ? new Date(ev.fechaInicio) : null;
          const end = ev.fechaFin ? new Date(ev.fechaFin) : null;

          methods.reset({
            nombre: ev.nombre || "",
            tipo: ev.tipo || "",
            fecha: start ? start.toISOString().slice(0, 10) : "",
            horaInicio: start ? start.toISOString().slice(11, 16) : "",
            fechaFin: end ? end.toISOString().slice(0, 10) : (start ? start.toISOString().slice(0,10) : ""),
            horaCierre: end ? end.toISOString().slice(11, 16) : "",
            capacidad: ev.capacidad || "",
            presupuesto: ev.presupuesto || "",
            promotor: ev.promotor || "",
            telefono: ev.telefono || "",
            email: ev.email || "",
            desc: ev.descripcion || "",
            generos: ev.generos ?? [],
            edad: (ev.edad ?? 18) as any,
            dress_code: ev.dress_code || "",
            tieneLineup: (ev.tieneLineup ? "Sí" : "No") as any,
            cantidadDJs: String(ev.cantidadDJs ?? 0),
            djs: ev.djs ?? [],
            flyer: null as any,
            imgSec: null as any,
            clubId: ev.clubId || "",
            venderTickets: !!ev.venderTickets,
            perUserLimit: Number(ev.perUserLimit ?? 0),
            ventaAbre: ev.ventaAbre ? new Date(ev.ventaAbre).toISOString().slice(0,16) : "",
            ventaCierra: ev.ventaCierra ? new Date(ev.ventaCierra).toISOString().slice(0,16) : "",
            generosOtro: "",
          } as any);

          if (ev.clubId) {
            try {
              const clubRef = doc(firebaseDb as Firestore, "club", ev.clubId);
              const clubSnap = await getDoc(clubRef);
              if (alive && clubSnap.exists()) setClub(clubSnap.data() as ClubDoc);
            } catch (e) { console.warn("No se pudo cargar el club:", e); }
          }

          if (ev.venderTickets) {
            try {
              const tSnap = await getDocs(collection(firebaseDb as Firestore, `evento/${id}/ticketTypes`));
              if (alive) {
                const list = tSnap.docs
                  .map((d) => ({ id: d.id, ...(d.data() as TicketTypeDoc) }))
                  .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
                setTickets(list as any);
              }
            } catch (e) { console.warn("No se pudieron cargar los tickets:", e); }
          }

          setLoading(false);
          return;
        }

        // Compat/legacy
        const oldRef = doc(firebaseDb as Firestore, "evento", id);
        const oldSnap = await getDoc(oldRef);
        if (oldSnap.exists()) {
          const data = oldSnap.data() as EventLegacy;
          if (!alive) return;
          setEventLegacy({ id, ...data });

          // Prefill al mismo form
          methods.reset({
            nombre: data.nombre || "",
            tipo: data.tipo || "",
            fecha: data.fecha || "",
            horaInicio: data.horaInicio || "",
            fechaFin: data.fecha || "",
            horaCierre: data.horaCierre || "",
            capacidad: data.capacidad || "",
            presupuesto: data.presupuesto || "",
            promotor: data.promotor || "",
            telefono: data.telefono || "",
            email: data.email || "",
            desc: data.desc || "",
            generos: normalizeGeneros(data.generos),
            edad: String(data.edad ?? 18) as any,
            dress_code: data.dress_code || "",
            reservas: (data.aceptaReservas ? "Sí" : "No") as any,
            tieneVip: countToVipSelect(data.cantidadZonasVip),
            tieneLineup: (data.lineup ? "Sí" : "No") as any,
            cantidadDJs: String(data.cantidadDJs ?? ""),
            djs: Array.isArray(data.djs) ? data.djs : [],
            flyer: null as any,
            imgSec: null as any,
            clubId: (data as any).clubId || "",
            venderTickets: false,
            perUserLimit: 0,
            ventaAbre: "",
            ventaCierra: "",
            generosOtro: "",
          } as any);

          setLoading(false);
          return;
        }

        toast.error("No se encontró el evento.");
      } catch (err) {
        console.error("Error cargando evento:", err);
        toast.error("No se pudo cargar el evento.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ---------- Derivados ----------
  const isNew = !!eventNew;
  const flyer = (eventNew?.flyer ?? eventLegacy?.flyer) || null;
  const imgSec = (eventNew?.imgSec ?? eventLegacy?.imgSec) || null;
  const nombre = eventNew?.nombre ?? eventLegacy?.nombre ?? "Evento";
  const tipo = eventNew?.tipo ?? eventLegacy?.tipo ?? "—";
  const generos = eventNew?.generos ?? normalizeGeneros(eventLegacy?.generos);
  const edad = eventNew?.edad ?? eventLegacy?.edad ?? 18;
  const dressCode = eventNew?.dress_code ?? eventLegacy?.dress_code ?? "—";
  const desc = eventNew?.descripcion ?? eventLegacy?.desc ?? "";

  const startISO =
    eventNew?.fechaInicio ??
    (eventLegacy ? `${eventLegacy.fecha}T${eventLegacy.horaInicio ?? "00:00"}:00` : null);
  const endISO =
    eventNew?.fechaFin ??
    (eventLegacy ? `${eventLegacy.fecha}T${eventLegacy.horaCierre ?? "00:00"}:00` : null);

  const isPast = useMemo(() => {
    const end = endISO ?? startISO;
    return end ? Date.now() > new Date(end).getTime() : false;
  }, [startISO, endISO]);

  const canBuySomething = useMemo(() => {
    return !!(eventNew?.venderTickets && tickets.some((t) => t.activo && (t.stockDisponible ?? 0) > 0));
  }, [eventNew, tickets]);

  // ======= Permisos: sólo dueño o admin =======
  const extractUid = (path?: string | null) => {
    if (!path) return null;
    const m = String(path).match(/\/?usersWeb\/([^/]+)/);
    return m ? m[1] : null;
  };
  const ownerUid = extractUid(eventNew?.uid_usersWeb || eventLegacy?.uid_usersWeb);
  const roles = (user as any)?.roles || ((user as any)?.role ? [(user as any)?.role] : []);
  const isAdmin = !!((user as any)?.isAdmin || (user as any)?.claims?.admin || roles?.includes?.("admin"));
  const canEdit = !!user && (((ownerUid ? user.uid === ownerUid : false) || isAdmin));

  // ======= Comprar: SIEMPRE pasar por carrito =======
  const pickDefaultTicket = (): TicketTypeDoc | null => {
    const ok = tickets
      .filter((t) => t.activo && (t.stockDisponible ?? 0) > 0 && (t.price ?? 0) >= 0)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    return ok[0] ?? null;
  };

  // ---------- Upload helper ----------
  const uploadImage = async (file: File | null, folder: string): Promise<string | null> => {
    if (!file) return null;
    const storage = getStorage();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `evento/${id}/${folder}/${Date.now()}.${ext}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return getDownloadURL(ref);
  };

  // ---------- Validaciones cruzadas antes de guardar ----------
  const validateCross = (data: EventFormValues): { ok: boolean; msg?: string } => {
    const start = combineDateTime(data.fecha, data.horaInicio);
    const end = combineDateTime(data.fechaFin, data.horaCierre);
    if (!start || !end) return { ok: true };
    if (end.getTime() < start.getTime()) {
      return { ok: false, msg: "La fecha/hora de fin no puede ser anterior al inicio." };
    }
    if (data.ventaAbre || data.ventaCierra) {
      const ventaAbre = data.ventaAbre ? new Date(data.ventaAbre) : null;
      const ventaCierra = data.ventaCierra ? new Date(data.ventaCierra) : null;
      if (ventaAbre && ventaCierra && ventaCierra.getTime() < ventaAbre.getTime()) {
        return { ok: false, msg: "La venta cierra no puede ser anterior a la venta abre." };
      }
      if (ventaCierra && start && ventaCierra.getTime() > start.getTime()) {
        return { ok: false, msg: "La venta debe cerrar antes de que comience el evento." };
      }
    }
    return { ok: true };
  };

  // ---------- Guardar (nuevo esquema) ----------
  const onConfirmSaveNew = async (values: EventFormValues) => {
    if (!canEdit) { toast.error("No tienes permisos para editar este evento."); return; }
    setSaving(true);
    try {
      const newFlyer =
        values.flyer instanceof File ? await uploadImage(values.flyer, "flyer") : null;
      const newImgSec =
        values.imgSec instanceof File ? await uploadImage(values.imgSec, "imgSec") : null;

      let generosFinal = [...(values.generos ?? [])];
      const otro = generosOtroWatch || generosOtroLocal;
      if (generosFinal.includes("Otros") && (otro?.trim() ?? "")) {
        generosFinal = generosFinal.filter((g) => g !== "Otros");
        generosFinal.push(otro.trim());
      }

      const start = combineDateTime(values.fecha, values.horaInicio);
      const end = combineDateTime(values.fechaFin, values.horaCierre);

      const payload: Partial<EventNew> = {
        nombre: values.nombre,
        tipo: values.tipo,
        fechaInicio: start ? start.toISOString() : null,
        fechaFin: end ? end.toISOString() : null,
        clubId: values.clubId,
        capacidad: values.capacidad,
        presupuesto: values.presupuesto || null,
        promotor: values.promotor,
        telefono: values.telefono,
        email: values.email,
        descripcion: values.desc || "",
        generos: generosFinal,
        edad: Number(values.edad ?? 18),
        dress_code: values.dress_code,
        tieneLineup: asBool(values.tieneLineup),
        cantidadDJs: Array.isArray(values.djs) ? values.djs.length : Number(values.cantidadDJs ?? 0),
        djs: values.djs ?? [],
        flyer: newFlyer ?? eventNew?.flyer ?? null,
        imgSec: newImgSec ?? eventNew?.imgSec ?? null,
        venderTickets: !!values.venderTickets,
        moneda: (eventNew?.moneda as any) || "CLP",
        perUserLimit: Math.max(0, Number(values.perUserLimit ?? 0)),
        ventaAbre: values.ventaAbre ? new Date(values.ventaAbre).toISOString() : null,
        ventaCierra: values.ventaCierra ? new Date(values.ventaCierra).toISOString() : null,
        // VIP / reservas (compat)
        ...(typeof (values as any).reservas !== "undefined" ? { aceptaReservas: asBool((values as any).reservas) } : {}),
        cantidadZonasVip: vipToCount(values.tieneVip),
        tieneVip: vipToCount(values.tieneVip) > 0,
      };

      await updateDoc(doc(firebaseDb as Firestore, "evento", id!), payload as any);
      toast.success("Datos guardados");
      setEventNew({ ...(eventNew as any), ...payload } as any);
      setEditMode(false);
      setConfirmOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "No se pudo guardar");
    } finally { setSaving(false); }
  };

  // ---------- Guardar (legacy) ----------
  const onConfirmSaveLegacy = async (values: EventFormValues) => {
    if (!canEdit) { toast.error("No tienes permisos para editar este evento."); return; }
    if (!eventLegacy) { toast.error("Evento no disponible para edición."); return; }
    setSaving(true);
    try {
      const newFlyer =
        values.flyer instanceof File ? await uploadImage(values.flyer, "flyer") : null;
      const newImgSec =
        values.imgSec instanceof File ? await uploadImage(values.imgSec, "imgSec") : null;

      let generosFinal = [...(values.generos ?? [])];
      const otro = generosOtroWatch || generosOtroLocal;
      if (generosFinal.includes("Otros") && (otro?.trim() ?? "")) {
        generosFinal = generosFinal.filter((g) => g !== "Otros");
        generosFinal.push(otro.trim());
      }

      const payload: Partial<EventLegacy> & Partial<EventNew> = {
        nombre: values.nombre,
        tipo: values.tipo,
        fecha: values.fecha,
        horaInicio: values.horaInicio || null,
        horaCierre: values.horaCierre || null,
        capacidad: values.capacidad || null,
        presupuesto: values.presupuesto || null,
        promotor: values.promotor,
        telefono: values.telefono,
        email: values.email,
        desc: values.desc || null,
        generos: generosFinal,
        edad: Number(values.edad ?? 18),
        dress_code: values.dress_code,
        cantidadZonasVip: vipToCount(values.tieneVip),
        aceptaReservas: asBool((values as any).reservas),
        lineup: asBool(values.tieneLineup),
        cantidadDJs: Array.isArray(values.djs) ? values.djs.length : Number(values.cantidadDJs ?? 0),
        djs: values.djs ?? [],
        flyer: newFlyer ?? eventLegacy.flyer ?? null,
        imgSec: newImgSec ?? eventLegacy.imgSec ?? null,

        // Campos de venta añadidos (guardamos por compat aunque legacy no venda):
        venderTickets: !!values.venderTickets,
        moneda: "CLP",
        perUserLimit: Math.max(0, Number(values.perUserLimit ?? 0)),
        ventaAbre: values.ventaAbre ? new Date(values.ventaAbre).toISOString() : null,
        ventaCierra: values.ventaCierra ? new Date(values.ventaCierra).toISOString() : null,
      };

      await updateDoc(doc(firebaseDb as Firestore, "evento", eventLegacy.id_evento || id!), payload as any);
      toast.success("Datos guardados");
      setEventLegacy({ ...(eventLegacy as any), ...payload });
      setEditMode(false);
      setConfirmOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "No se pudo guardar");
    } finally { setSaving(false); }
  };

  // ---------- Borrar ----------
  const onConfirmDelete = async () => {
    if (!canEdit) { toast.error("No tienes permisos para eliminar este evento."); return; }
    setDeleting(true);
    try {
      await deleteDoc(doc(firebaseDb as Firestore, "evento", id!));
      toast.success("Evento eliminado");
      setConfirmDeleteOpen(false);
      navigate("/mis-eventos");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "No se pudo eliminar el evento");
    } finally { setDeleting(false); }
  };

  /* ===================== Render ===================== */
  if (loading) return <div className="p-6 ">Cargando…</div>;
  if (!eventNew && !eventLegacy) {
    return (
      <div className="p-6 ">
        <p>No se encontró el evento.</p>
        <Link to="/mis-eventos" className="text-[#8e2afc] underline">Volver a mis eventos</Link>
      </div>
    );
  }

  const waHref =
    (eventNew?.telefono ?? eventLegacy?.telefono)
      ? `https://wa.me/${String(eventNew?.telefono ?? eventLegacy?.telefono).replace(/\D/g, "")}`
      : undefined;
  const mailHref =
    (eventNew?.email ?? eventLegacy?.email)
      ? `mailto:${eventNew?.email ?? eventLegacy?.email}`
      : undefined;

  return (
    <div className="">
      {/* ===== HERO ===== */}
      <section className="relative isolate w-full overflow-visible -mb-24 md:-mb-32">
        {/* Fondo */}
        <div
          className="pointer-events-none absolute -inset-x-40 -top-32 -bottom-56 -z-10 overflow-visible"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
          }}
        >
          {flyer ? (
            <>
              <img
                src={flyer}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover scale-[1.35] blur-[72px] opacity-[0.55]"
              />
              <div className="absolute inset-0 [background:radial-gradient(1200px_560px_at_64%_32%,rgba(0,0,0,0)_0%,rgba(0,0,0,.55)_60%,rgba(0,0,0,.98)_100%)]" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/80" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#201022] via-[#2b1638] to-black" />
          )}
        </div>

        {/* Contenido */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-14">
          <div className="grid gap-8 md:gap-10 md:grid-cols-[340px_1fr] items-start">
            {/* PÓSTER */}
            <div className="shrink-0">
              <figure className="relative w-[250px] sm:w-[300px] md:w-[340px] aspect-square rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                <img
                  src={flyer || "https://placehold.co/800x1000/101013/FFF?text=Evento"}
                  alt={nombre}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="sync"
                />
                <div className="absolute right-2 bottom-2">
                  <button
                    className="inline-flex w-9 h-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/75 border border-white/15"
                    title={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
                    onClick={() => setIsFav((v) => { const next = !v; toast.success(next ? "Agregado a favoritos" : "Quitado de favoritos"); return next; })}
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41.99 4.22 2.48C11.53 4.99 13.2 4 14.94 4 17.44 4 19.5 6 19.5 8.5c0 3.78-3.4 6.86-8.05 11.54L12 21.35z" />
                    </svg>
                  </button>
                </div>
              </figure>

              {/* ICONOS */}
              <div className="mt-3 flex items-center gap-2 relative">
                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer"
                    title="WhatsApp"
                    aria-label="WhatsApp"
                    className="inline-flex w-9 h-9 items-center justify-center rounded-full border border-white/15 bg-black/60 hover:bg-black/75"
                  >
                    <SiWhatsapp className="w-4 h-4" />
                  </a>
                )}
                {mailHref && (
                  <a
                    href={mailHref}
                    title="Correo"
                    aria-label="Correo"
                    className="inline-flex w-9 h-9 items-center justify-center rounded-full border border-white/15 bg-black/60 hover:bg-black/75"
                  >
                    <MdOutlineMail className="w-4 h-4" />
                  </a>
                )}
                <button
                  title="Compartir"
                  aria-label="Compartir"
                  onClick={() => { if (navigator.share) { navigator.share({ title: nombre, url: location.href }).catch(() => {}); } else { setShareOpen((v) => !v); } }}
                  className="inline-flex w-9 h-9 items-center justify-center rounded-full border border-white/15 bg-black/60 hover:bg-black/75"
                >
                  <FiShare2 className="w-4 h-4" />
                </button>

                {shareOpen && (
                  <div className="absolute top-11 left-0 z-40 rounded-xl border border-white/10 bg-black/80 backdrop-blur px-3 py-2 text-sm shadow-lg">
                    <div className="grid gap-1 min-w-[240px]">
                      <a
                        className="hover:bg-white/10 rounded px-2 py-1 inline-flex items-center gap-2"
                        href={`https://wa.me/?text=${encodeURIComponent(`Mira ${nombre} en GoUp: ${location.href}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShareOpen(false)}
                      >
                        <SiWhatsapp className="w-4 h-4" /> WhatsApp
                      </a>
                      <a
                        className="hover:bg-white/10 rounded px-2 py-1 inline-flex items-center gap-2"
                        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(`Mira ${nombre} en GoUp`)}`}
                        target="_blank" rel="noreferrer" onClick={() => setShareOpen(false)}>
                        <SiX className="w-4 h-4" /> X (Twitter)
                      </a>
                      <a
                        className="hover:bg-white/10 rounded px-2 py-1 inline-flex items-center gap-2"
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`}
                        target="_blank" rel="noreferrer" onClick={() => setShareOpen(false)}>
                        <SiFacebook className="w-4 h-4" /> Facebook
                      </a>
                      <button className="text-left hover:bg-white/10 rounded px-2 py-1 inline-flex items-center gap-2" onClick={copyLink}>
                        <MdOutlineMail className="w-4 h-4" /> Copiar enlace
                      </button>
                      <div className="text-white/60 px-2 pt-1 text-xs">
                        * Instagram/Stories no permiten compartir directo desde web; usa “Copiar enlace”.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* META + CTA */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className={`text-xs px-2 py-1 rounded border ${isPast ? "bg-white/10 border-white/20 text-white/80" : "bg-[#8e2afc]/30 border-[#8e2afc]/50 text-[#e4d7ff]"}`}>
                  {isPast ? "Realizado" : "Próximo"}
                </span>
                {edad ? <span className="text-xs px-2 py-1 rounded bg-black/40 border border-white/15">+{edad}</span> : null}
                {dressCode ? <span className="text-xs px-2 py-1 rounded bg-black/40 border border-white/15">Dress code: {dressCode}</span> : null}
              </div>

              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">{nombre}</h1>

              <div className="mt-3 text-white/85 space-y-1">
                <div className="text-lg font-medium">{club?.nombre ?? "—"}</div>
                <div className="text-base">
                  {fmtDateLong(startISO ?? (eventLegacy ? `${eventLegacy.fecha}T00:00:00` : null))}
                  {(startISO || endISO) && (
                    <>
                      {" · "}
                      <span className="text-white/70">
                        {startISO ? fmtDateShort(startISO) : "—"}{" "}
                        {endISO ? `– ${fmtDateShort(endISO)}` : ""}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-sm text-white/70">
                  {(club?.ciudad ?? "")}{club?.ciudad && club?.pais ? " · " : ""}{(club?.pais ?? "")}
                </div>
              </div>

              {generos?.length ? (
                <div className="flex flex-wrap gap-2 mt-4">
                  {generos.map((g) => (
                    <span key={g} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">{g}</span>
                  ))}
                </div>
              ) : null}
{/* Separador */}
<div className="h-10 md:h-14" />
              {/* Price bar + CTA – móvil apilado */}
             {/* Localidad */}
              <section className="rounded-xl border /10 bg-white/[0.03] backdrop-blur p-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-[#cbb3ff]">Localidad</h2>
                  {club && (
                    <div className="flex gap-2">
                      <a
                        href={
                          club.latitud != null && club.longitud != null
                            ? `https://www.google.com/maps/search/?api=1&query=${club.latitud},${club.longitud}`
                            : club.direccion
                            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(club.direccion)}`
                            : "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm"
                      >
                        Google Maps
                      </a>
                      <a
                        href={
                          club.latitud != null && club.longitud != null
                            ? `https://waze.com/ul?ll=${club.latitud}%2C${club.longitud}&navigate=yes`
                            : club.direccion
                            ? `https://waze.com/ul?q=${encodeURIComponent(club.direccion)}&navigate=yes`
                            : "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm"
                      >
                        Waze
                      </a>
                    </div>
                  )}
                </div>
                {club ? (
                  <div className="space-y-1">
                    <p className=" font-semibold">{club.nombre}</p>
                    <p className="/80 text-sm">
                      {[club.direccion, club.ciudad, club.pais].filter(Boolean).join(", ")}
                    </p>
                  </div>
                ) : (
                  <p className="/60 text-sm">Sin localidad asociada.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      </section>

    
      

      {/* CTA editar / borrar – visible sólo si permitido. Móvil apilado */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-14">
      {canEdit && (
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row gap-3 relative z-20">
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="px-4 py-2 rounded-md bg-[#8e2afc]/40 hover:bg-[#7b1fe0] transition w-full sm:w-auto"
          >
            Editar datos
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="px-4 py-2 rounded-md bg-rose-600/70 hover:bg-rose-500 transition w-full sm:w-auto"
          >
            Eliminar evento
          </button>
        </div>
      )}

      {/* CONTENIDO */}
      <div className="max-w-6xl mx-auto px-4 pb-10">
        {!editMode && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Columna principal */}
            <div className="lg:col-span-2 space-y-6">
              

              {/* Entradas */}
              <section className="rounded-xl border /10 bg-white/[0.03] backdrop-blur p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-[#cbb3ff]">Entradas</h2>
                  {eventNew?.venderTickets ? (
                    <span className="text-xs /60">Tope por usuario: {eventNew?.perUserLimit ?? 0}</span>
                  ) : null}
                </div>

                {!eventNew?.venderTickets ? (
                  <p className="/70 mt-2 text-sm">Este evento no vende tickets a través de la plataforma.</p>
                ) : tickets.length === 0 ? (
                  <p className="/60 text-sm mt-2">Aún no hay tipos de ticket definidos.</p>
                ) : (
                  <ul className="mt-4 grid gap-3">
                    {tickets.map((t, idx) => {
                      const { puedeComprar, badge } = getTicketState(eventNew, t);
                      const badgeCls =
                        badge.tone === "ok"
                          ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300"
                          : badge.tone === "warn"
                          ? "bg-amber-500/15 border-amber-400/30 text-amber-300"
                          : "bg-white/10 /15 /70";
                      const currentQty = qtyMap[t.id || t.name] ?? 1;

                      return (
                        <li
                          key={`${t.name}-${idx}`}
                          className="rounded-lg border /10 bg-white/[0.04] p-4 flex flex-col sm:flex-row gap-3 sm:items-center"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{t.name}</p>
                            <p className="text-sm /70">
                              Precio: {CLP.format(t.price || 0)} • Disponibles: {Math.max(0, t.stockDisponible ?? 0)}
                            </p>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2 w-full sm:w-auto">
                            <span className={`text-xs px-2 py-1 rounded border ${badgeCls}`}>{badge.label}</span>

                            {puedeComprar && (
                              <select
                                className="px-2 py-1 rounded-md bg-black/40 border border-white/15 text-sm w-full sm:w-auto"
                                value={currentQty}
                                onChange={(e) =>
                                  setQtyMap((m) => ({
                                    ...m,
                                    [t.id || t.name]: Math.max(
                                      1,
                                      Math.min(getMaxQty(t), Number(e.target.value) || 1)
                                    ),
                                  }))
                                }
                              >
                                {Array.from({ length: getMaxQty(t) }).map((_, i) => (
                                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                                ))}
                              </select>
                            )}

                            {/* Añadir al carrito */}
                            <button
                              type="button"
                              disabled={!puedeComprar}
                              className={`px-3 py-2 rounded-md /90 w-full sm:w-auto ${
                                puedeComprar ? "bg-white/10 hover:bg-white/15" : "bg-white/10 disabled:opacity-60 cursor-not-allowed"
                              }`}
                              onClick={() => {
                                if (!puedeComprar) return;
                                const current = readCart();
                                if (current.length > 0) {
                                  const existingEvent = current[0].eventId;
                                  if (existingEvent && existingEvent !== id) {
                                    setLockModal(true);
                                    return;
                                  }
                                }
                                const qty = qtyMap[t.id || t.name] ?? 1;
                                addToCart({
                                  eventId: id!,
                                  eventName: nombre,
                                  eventImage: flyer,
                                  ticketId: t.id || "",
                                  ticketName: t.name,
                                  price: Number(t.price || 0),
                                  currency: eventNew?.moneda || "CLP",
                                  qty,
                                  ticketPath: t.id ? `evento/${id}/ticketTypes/${t.id}` : null,
                                  eventStart: startISO || null,
                                  eventEnd: endISO || null,
                                  addedAt: Date.now(),
                                });
                                setCartQty(countCart());
                                toast.success("Agregado al carrito");
                              }}
                            >
                              Añadir al carrito
                            </button>

                            {/* Comprar ahora -> va a carrito con el ítem agregado */}
                            <Link
                              to={CART_ROUTE}
                              className="px-3 py-2 rounded-md /90 font-semibold w-full sm:w-auto inline-flex items-center gap-2 bg-[#8e2afc] hover:bg-[#7b1fe0]"
                            >
                              <CartIcon className="w-4 h-4" />
                              <span>Ir a tu carrito</span>
                              <span className="ml-1 text-black bg-white rounded-full min-w-5 h-5 px-2 grid place-items-center text-xs">
                                {cartQty}
                              </span>
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Descripción */}
              {desc && (
                <section className="rounded-xl border /10 bg-white/[0.03] backdrop-blur p-5">
                  <h2 className="text-lg font-bold text-[#cbb3ff] mb-2">Descripción</h2>
                  <p className="/80 leading-relaxed">{desc}</p>
                </section>
              )}

              {/* Line-up */}
              <section className="rounded-xl border /10 bg-white/[0.03] backdrop-blur p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-[#cbb3ff]">Line-up</h2>
                  <span className="text-xs /60">
                    {(eventNew?.tieneLineup ?? eventLegacy?.lineup) ? "Con line-up" : "Sin line-up"}
                  </span>
                </div>
                {((eventNew?.djs && eventNew.djs.length > 0) || (eventLegacy?.djs && eventLegacy.djs.length > 0)) ? (
                  <ul className="mt-3 grid sm:grid-cols-2 gap-2">
                    {(eventNew?.djs ?? eventLegacy?.djs ?? []).map((dj, i) => (
                      <li key={`${dj}-${i}`} className="px-3 py-2 rounded border /10 bg-white/5 text-sm flex items-center gap-2">
                        <span className="inline-flex w-6 h-6 rounded-full bg-[#8e2afc]/30 border border-[#8e2afc]/50 text-center items-center justify-center text-xs">{i + 1}</span>
                        <span className="truncate">{dj}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="/60 mt-2 text-sm">No se registraron DJs.</p>
                )}
              </section>

              {/* Galería */}
              <section className="rounded-xl border /10 bg-white/[0.03] backdrop-blur p-5">
                <h2 className="text-lg font-bold text-[#cbb3ff] mb-3">Galería</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <figure className="rounded-lg overflow-hidden border /10">
                    {flyer ? (
                      <img src={flyer} className="w-full h-64 object-cover" alt="Flyer" />
                    ) : (
                      <div className="w-full h-64 grid place-items-center /40 bg-white/5">Sin flyer</div>
                    )}
                  </figure>
                  <figure className="rounded-lg overflow-hidden border /10">
                    {imgSec ? (
                      <img src={imgSec} className="w-full h-64 object-cover" alt="Imagen secundaria" />
                    ) : (
                      <div className="w-full h-64 grid place-items-center /40 bg-white/5">Sin imagen secundaria</div>
                    )}
                  </figure>
                </div>
              </section>
            </div>

            {/* Columna lateral */}
            <aside className="space-y-6">
              <Card title="Resumen">
                <KeyRow k="Tipo" v={tipo} />
                <KeyRow k="Fecha" v={fmtDateLong(startISO ?? (eventLegacy ? `${eventLegacy.fecha}T00:00:00` : null))} />
                <KeyRow
                  k="Horario"
                  v={
                    startISO || endISO
                      ? `${startISO ? fmtDateShort(startISO) : "—"} ${endISO ? `– ${fmtDateShort(endISO)}` : ""}`
                      : "—"
                  }
                />
                <KeyRow k="Capacidad" v={eventNew?.capacidad ?? eventLegacy?.capacidad ?? "—"} />
                {(eventNew?.presupuesto || eventLegacy?.presupuesto) && (
                  <KeyRow k="Presupuesto" v={eventNew?.presupuesto ?? eventLegacy?.presupuesto ?? "—"} />
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge label={`+${edad ?? 18}`} />
                  <Badge label={`Dress code: ${dressCode || "—"}`} />
                </div>
              </Card>

              <Card title="Políticas">
                <KeyRow
                  k="Line-up"
                  v={(eventNew?.tieneLineup ?? eventLegacy?.lineup) ? `Sí • ${(eventNew?.cantidadDJs ?? eventLegacy?.cantidadDJs) ?? 0} DJ(s)` : "No"}
                />
                {typeof eventLegacy?.aceptaReservas === "boolean" && <KeyRow k="Reservas" v={eventLegacy.aceptaReservas ? "Sí" : "No"} />}
              </Card>

              {eventNew?.venderTickets && (
                <Card title="Venta">
                  <KeyRow k="Moneda" v={eventNew.moneda ?? "CLP"} />
                  <KeyRow k="Tope por usuario" v={String(eventNew.perUserLimit ?? 0)} />
                  <KeyRow k="Abre" v={fmtDateShort(eventNew.ventaAbre)} />
                  <KeyRow k="Cierra" v={fmtDateShort(eventNew.ventaCierra)} />
                </Card>
              )}

              <Card title="Contacto">
                <KeyRow k="Promotor" v={eventNew?.promotor ?? eventLegacy?.promotor ?? "—"} />
                <KeyRow
                  k="Teléfono"
                  v={
                    (eventNew?.telefono ?? eventLegacy?.telefono) ? (
                      <a href={`tel:${eventNew?.telefono ?? eventLegacy?.telefono}`} className="text-[#cbb3ff] hover:underline">
                        {eventNew?.telefono ?? eventLegacy?.telefono}
                      </a>
                    ) : "—"
                  }
                />
                <KeyRow
                  k="Email"
                  v={
                    (eventNew?.email ?? eventLegacy?.email) ? (
                      <a href={`mailto:${eventNew?.email ?? eventLegacy?.email}`} className="text-[#cbb3ff] hover:underline">
                        {eventNew?.email ?? eventLegacy?.email}
                      </a>
                    ) : "—"
                  }
                />
              </Card>
            </aside>
          </div>
        )}

        {/* ==================== EDICIÓN (mismo form que crear, todo habilitado, pre-rellenado) ==================== */}
        {editMode && (
          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit((values) => {
                const cross = validateCross(values);
                if (!cross.ok) {
                  toast.error(cross.msg || "Revisa las fechas del evento y ventas.");
                  return;
                }
                setConfirmOpen(true);
              })}
              className="space-y-6 mt-2"
              noValidate
            >
              {/* Aviso permisos si alguien llegó acá sin permiso (no debería porque ocultamos el botón) */}
              {!canEdit && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  No tienes permisos para editar este evento.
                </div>
              )}

              <Section title="Información del evento">
                <div className="grid md:grid-cols-2 gap-4">
                  <RHFInput name="nombre" label="Nombre del Evento *" placeholder="Ej: PURPLE NIGHTS • MIDNIGHT VIBES" />
                  <RHFSelect name="tipo" label="Tipo de evento *" options={["Club","Festival","After","Privado","Open Air","Bar"]} />
                </div>
              </Section>

              <Section title="Localidad & tickets">
                <div className="space-y-4">
                  <VenueCombo
                    value={methods.watch("clubId")}
                    onChange={(clubId) => methods.setValue("clubId", clubId, { shouldValidate: true })}
                    onNewVenue={() => setNewVenueOpen(true)}
                  />
                  <div className="rounded-lg border /10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <label htmlFor="sell" className="font-medium">Vender tickets</label>
                      <input
                        id="sell"
                        type="checkbox"
                        className="h-5 w-5 accent-[#8e2afc]"
                        checked={!!venderTickets}
                        onChange={(e) => methods.setValue("venderTickets", e.target.checked)}
                      />
                    </div>
                    {venderTickets && (
                      <div className="mt-4 grid md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs /60">Tope por usuario (global)</label>
                          <input
                            type="number"
                            min={0}
                            className="w-full bg-white/5  placeholder-white/40 border /10 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8e2afc]"
                            value={Number(perUserLimit || 0)}
                            onChange={(e) =>
                              methods.setValue("perUserLimit", Math.max(0, Number(e.target.value) || 0), {
                                shouldValidate: true,
                              })
                            }
                          />
                        </div>
                        <RHFInput name="ventaAbre" type="datetime-local" label="Venta abre" />
                        <RHFInput name="ventaCierra" type="datetime-local" label="Venta cierra" />
                      </div>
                    )}
                  </div>
                </div>
              </Section>

              <Section title="Fecha & horario">
                <div className="grid md:grid-cols-4 gap-4">
                  <RHFInput name="fecha" type="date" label="Fecha de inicio *" />
                  <RHFInput name="horaInicio" type="time" label="Hora de inicio *" />
                  <RHFInput name="fechaFin" type="date" label="Fecha de término *" />
                  <RHFInput name="horaCierre" type="time" label="Hora de término *" />
                </div>
              </Section>

              <Section title="Capacidad">
                <RHFSelect name="capacidad" label="Capacidad esperada *" options={["0 a 200","201 a 500","501 a 1000","Más de 1000"]} />
              </Section>

              <Section title="Contacto del organizador">
                <div className="grid md:grid-cols-3 gap-4">
                  <RHFInput name="promotor" label="Promotor *" />
                  <RHFInput name="telefono" label="Teléfono *" />
                  <RHFInput name="email" type="email" label="Email *" />
                </div>
              </Section>

              <Section title="Concepto & experiencia">
                <RHFTextarea name="desc" label="Descripción *" rows={4} />
                <RHFCheckboxGroup
                  name="generos"
                  label="Géneros musicales *"
                  options={["Reguetón","Techno","House","Pop","Salsa","Hardstyle","Trance","Hip-Hop","Urbano","Guaracha","Otros"]}
                />
                {methods.watch("generos")?.includes("Otros") && (
                  <RHFInput
                    name="generosOtro"
                    label="¿Cuál otro género?"
                    value={generosOtroLocal}
                    onChange={(e) => setGenerosOtroLocal(e.target.value)}
                  />
                )}
              </Section>

              <Section title="Políticas del evento">
                <div className="grid md:grid-cols-3 gap-4">
                  <RHFSelect name="edad" label="Edad mínima *" options={Array.from({ length: 53 }, (_, i) => `${i + 18}`)} />
                  <RHFSelect name="dress_code" label="Dress code *" options={["Casual","Formal","Semi-formal","Urbano","Temático"]} />
                  <RHFSelect name="reservas" label="¿Acepta reservas?" options={["Sí","No"]} />
                </div>
                <div className="grid md:grid-cols-3 gap-4 mt-4">
                  <RHFSelect name="tieneVip" label="¿Zonas VIP?" options={["No","1","2","Más de 5"]} />
                  <RHFSelect name="tieneLineup" label="¿Tendrá Lineup?" options={["Sí","No"]} />
                  <div className="hidden md:block" />
                </div>
                <div className="mt-2">
                  <LineupFields />
                </div>
              </Section>

              <Section title="Imágenes">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <div className="/70 text-sm mb-2">Flyer actual</div>
                    <div className="rounded overflow-hidden border /10 mb-3">
                      {flyer ? (
                        <img src={flyer} alt="Flyer actual" className="w-full h-48 object-cover" />
                      ) : (
                        <div className="w-full h-48 bg-white/10 grid place-items-center /40">Sin flyer</div>
                      )}
                    </div>
                    <RHFFile name="flyer" label="Reemplazar flyer (opcional)" />
                  </div>
                  <div>
                    <div className="/70 text-sm mb-2">Imagen secundaria actual</div>
                    <div className="rounded overflow-hidden border /10 mb-3">
                      {imgSec ? (
                        <img src={imgSec} alt="Imagen secundaria actual" className="w-full h-48 object-cover" />
                      ) : (
                        <div className="w-full h-48 bg-white/10 grid place-items-center /40">Sin imagen secundaria</div>
                      )}
                    </div>
                    <RHFFile name="imgSec" label="Reemplazar imagen secundaria (opcional)" />
                  </div>
                </div>
              </Section>

              {/* Acciones – móvil apilado */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 rounded border /20 hover:bg-white/10 w-full sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded bg-[#8e2afc] hover:bg-[#7b1fe0] disabled:opacity-60 w-full sm:w-auto"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </FormProvider>
        )}

        {/* Confirm guardar */}
        {confirmOpen && (
          <div className="fixed z-50 inset-0 grid place-items-center bg-black/60">
            <div className="bg-neutral-900 rounded-md p-6 w-[92vw] max-w-md text-center border /10">
              <h3 className="text-lg font-semibold mb-2">¿Guardar los cambios?</h3>
              <p className="/70 mb-5">Se actualizarán los datos del evento.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <button
                  className="px-4 py-2 rounded border /20 hover:bg-white/10 w-full sm:w-auto"
                  onClick={() => { setConfirmOpen(false); setSaving(false); }}
                >
                  No
                </button>
                <button
                  className="px-4 py-2 rounded bg-[#8e2afc] hover:bg-[#7b1fe0] w-full sm:w-auto"
                  disabled={saving}
                  onClick={methods.handleSubmit(isNew ? onConfirmSaveNew : onConfirmSaveLegacy)}
                >
                  Sí, guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm borrar */}
        {confirmDeleteOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70">
            <div className="bg-neutral-900 rounded-md p-6 w-[92vw] max-w-md text-center border border-rose-500/30">
              <h3 className="text-lg font-semibold text-rose-300 mb-2">¿Borrar este evento?</h3>
              <p className="/70 mb-5">Esta acción es <b>permanente</b> y no hay vuelta atrás.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <button
                  className="px-4 py-2 rounded border /20 hover:bg-white/10 w-full sm:w-auto"
                  onClick={() => setConfirmDeleteOpen(false)}
                  disabled={deleting}
                >
                  No, cancelar
                </button>
                <button
                  className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-60 w-full sm:w-auto"
                  onClick={onConfirmDelete}
                  disabled={deleting}
                >
                  {deleting ? "Eliminando…" : "Sí, borrar"}
                </button>
              </div>
            </div>
          </div>
        )}
        {lockModal && (
          <div className="fixed inset-0 z-[60]">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setLockModal(false)}
            />
            <div className="absolute inset-0 grid place-items-center p-4">
              <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#121212] p-5 shadow-2xl">
                <h3 className="text-lg font-bold mb-2">Un evento por compra</h3>
                <p className="text-sm text-white/80">
                  Tu carrito ya contiene entradas de <b>otro evento</b>. Por ahora solo
                  puedes combinar entradas del <b>mismo evento</b> en una orden.
                  Finaliza la compra actual o vacía tu carrito para agregar entradas de
                  un evento distinto.
                </p>
                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15"
                    onClick={() => setLockModal(false)}
                  >
                    Entendido
                  </button>
                  <Link
                    to={CART_ROUTE}
                    className="px-3 py-2 rounded-md bg-[#8e2afc] hover:bg-[#7b1fe0] inline-flex items-center gap-2"
                    onClick={() => setLockModal(false)}
                  >
                    <CartIcon className="w-4 h-4" />
                    Ver mi carrito
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal nueva localidad (para edición también) */}
      <NewVenueModal
        open={newVenueOpen}
        onClose={() => setNewVenueOpen(false)}
        onCreated={(clubId, nombre) => {
          methods.setValue("clubId", clubId, { shouldValidate: true });
          toast.success(`Localidad creada: ${nombre}`);
        }}
      />
      </div>
    </div>
  );
}