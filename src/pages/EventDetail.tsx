

// src/pages/EventDetail.tsx
// === DISEÑO PÚBLICO: SIN CAMBIOS ===
// Solo se modificó el FORM de edición para usar Artistas (como Event.tsx)
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
  setDoc,
  query,
  where,
  orderBy,
  limit as qLimit,
  serverTimestamp,
  increment,
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
import { FiArrowLeft } from "react-icons/fi";

import { useAuth } from "@/auth/AuthContext";

// ▼ schema creación
import { eventSchema } from "@/lib/schemas";
import NewVenueModal from "@/components/venues/NewVenueModal";
import VenueCombo from "@/components/venues/VenueComboBox";

// ===== import nuevos para edición =====
import { MUSIC_GENRES } from "@/lib/musicGenres";
import TicketTypesEditor from "@/components/tickets/TicketsEditor";
import type { TicketTypeDraft } from "@/types/commerce";

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
  eventStart?: string | null;
  eventEnd?: string | null;
  ticketId: string;
  ticketName: string;
  price: number;
  currency: string;
  qty: number;
  ticketPath?: string | null;
  addedAt: number;
};
const CART_KEY = "goupCart:v1";
function readCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
}
function writeCart(items: CartItem[]) { try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch {} }
function addToCart(item: CartItem) {
  const items = readCart();
  const idx = items.findIndex(
    (x) => x.eventId === item.eventId && x.ticketId === item.ticketId && x.price === item.price && x.currency === item.currency
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
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    }).format(new Date(iso));
  } catch { return iso; }
};
const fmtDateShort = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium", // fecha compacta legible
      timeStyle: "short",  // solo HH:MM sin segundos
    }).format(new Date(iso));
  } catch {
    return iso as string;
  }
};

const fmtTimeShort = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return iso as string; }
};

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

/* ==== Métricas (Embudo) ==== */
const yyyymmdd = (d: Date = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
};
type FunnelStepED = "views" | "carts" | "started" | "success";
async function bumpFunnelED(eventId: string, step: FunnelStepED, extra: Record<string, any> = {}) {
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
function guardOnceED(key: string, fn: () => Promise<void> | void) {
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  void fn();
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

  // NUEVO lineup
  artistasIds?: string[];
  artistasNombres?: string[];

  flyer?: string | null;
  imgSec?: string | null;
  venderTickets?: boolean;
  estado?: "publicado" | "draft" | "archivado";
  moneda?: "CLP" | "USD";
  perUserLimit?: number;
  ventaAbre?: string | null;
  ventaCierra?: string | null;

  // compat
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
  cantidadZonasVip: number | null;
  aceptaReservas: boolean | null;

  // legacy lineup fields (ignorado visualmente)
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
      z.string()
        .transform((v) => (v === "" ? 0 : Number(v)))
        .refine((n) => Number.isFinite(n) && n >= 0, "Tope inválido")
    ),
  ventaAbre: z.string().optional().or(z.literal("")),
  ventaCierra: z.string().optional().or(z.literal("")),
  fechaFin: z.string().min(1, "Debes indicar la fecha de término"),

  // NUEVO lineup
  artistasIds: z.array(z.string()).default([]),
});

type ExtraSaleFields = z.infer<typeof extraSchema>;

// El schema base de creación puede seguir teniendo campos legacy como `tieneLineup`.
// Aquí lo omitimos para este formulario de edición; si no existe `.omit`, usamos el schema tal cual.
const baseSchema: z.ZodTypeAny = (() => {
  const anySchema = eventSchema as any;
  if (anySchema && typeof anySchema.omit === "function") {
    return anySchema.omit({ tieneLineup: true });
  }
  return eventSchema as any;
})();

type EventBase = z.infer<typeof baseSchema>;
export type EventFormValues = EventBase & ExtraSaleFields;

const resolver = zodResolver(
  (baseSchema as any).and(extraSchema)
) as unknown as Resolver<EventFormValues>;

/* ===================== UI pequeños ===================== */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border /10 bg-white/[0.03] backdrop-blur p-5">
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
    <span className="text-xs px-2 py-1 rounded bg-[#FE8B02]/20 text-[#e4d7ff] border border-[#FE8B02]/30">
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

/* ===== ARTISTS PICKER (para edición) ===== */
type ArtistDoc = {
  id: string;
  nombre_artistico: string;
  generos: string[];
  fotoPerfilUrl?: string | null;
};
type MusicGenre = { id: string; main: string; subs: string[] };

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void; }) {
  return (
    <span className="inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded px-3 py-1 text-sm">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-1 rounded w-5 h-5 grid place-items-center bg-white/10 hover:bg-white/20" aria-label="Quitar">×</button>
      )}
    </span>
  );
}

function ArtistPicker({
  selected,
  setSelected,
}: {
  selected: { id: string; name: string }[];
  setSelected: (v: { id: string; name: string }[]) => void;
}) {
  const [genres, setGenres] = useState<MusicGenre[]>([]);
  const [mainFilter, setMainFilter] = useState<string>("");
  const [subFilter, setSubFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<ArtistDoc[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setGenres(MUSIC_GENRES.map((g) => ({ id: g.slug, main: g.genre, subs: g.subgenres })));
  }, []);
  useEffect(() => { setSubFilter(""); }, [mainFilter]);
  const currentSubs = useMemo(() => genres.find((g) => g.main === mainFilter)?.subs ?? [], [genres, mainFilter]);
  function chunk<T>(arr: T[], size: number) { const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }

  const fetchArtists = async () => {
    setLoading(true);
    try {
      const base = collection(firebaseDb as Firestore, "Artistas");
      let results: ArtistDoc[] = [];
      if (subFilter) {
        const qRef = query(base, where("generos", "array-contains", subFilter), qLimit(50));
        const snap = await getDocs(qRef);
        snap.forEach((d) => { const x = d.data() as any; results.push({ id: d.id, nombre_artistico: x.nombre_artistico, generos: x.generos || [], fotoPerfilUrl: x.fotoPerfilUrl || null }); });
      } else if (mainFilter) {
        const subs = currentSubs;
        if (subs.length > 0) {
          if (subs.length <= 10) {
            const qRef = query(base, where("generos", "array-contains-any", subs), qLimit(50));
            const snap = await getDocs(qRef);
            snap.forEach((d) => { const x = d.data() as any; results.push({ id: d.id, nombre_artistico: x.nombre_artistico, generos: x.generos || [], fotoPerfilUrl: x.fotoPerfilUrl || null }); });
          } else {
            const chunks = chunk(subs, 10);
            const fetched: Record<string, ArtistDoc> = {};
            for (const part of chunks) {
              const qRef = query(base, where("generos", "array-contains-any", part), qLimit(50));
              const snap = await getDocs(qRef);
              snap.forEach((d) => { const x = d.data() as any; fetched[d.id] = { id: d.id, nombre_artistico: x.nombre_artistico, generos: x.generos || [], fotoPerfilUrl: x.fotoPerfilUrl || null }; });
            }
            results = Object.values(fetched);
          }
        }
      } else {
        const qRef = query(base, orderBy("nombre_artistico"), qLimit(50));
        const snap = await getDocs(qRef);
        snap.forEach((d) => { const x = d.data() as any; results.push({ id: d.id, nombre_artistico: x.nombre_artistico, generos: x.generos || [], fotoPerfilUrl: x.fotoPerfilUrl || null }); });
      }
      results.sort((a, b) => (a.nombre_artistico || "").localeCompare(b.nombre_artistico || ""));
      setList(results);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchArtists(); /*eslint-disable-next-line*/ }, [mainFilter, subFilter]);

  useEffect(() => { setShowAll(false); }, [mainFilter, subFilter, search]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((a) => a.nombre_artistico?.toLowerCase().includes(s));
  }, [list, search]);

  const display = useMemo(() => (showAll ? filtered : filtered.slice(0, 9)), [filtered, showAll]);

  const add = (a: ArtistDoc) => { if (!selected.some((x) => x.id === a.id)) setSelected([...selected, { id: a.id, name: a.nombre_artistico }]); };
  const remove = (id: string) => setSelected(selected.filter((x) => x.id !== id));

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs /60">Género</label>
          <select className="goup-select" value={mainFilter} onChange={(e) => { setMainFilter(e.target.value); setSubFilter(""); }}>
            <option value="">Todos</option>
            {genres.map((g) => <option key={g.id} value={g.main}>{g.main}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs /60">Subgénero</label>
          <select className="goup-select" value={subFilter} onChange={(e) => setSubFilter(e.target.value)} disabled={!mainFilter}>
            <option value="">{mainFilter ? "Todos los subgéneros" : "Selecciona un género"}</option>
            {currentSubs.map((sg) => <option key={sg} value={sg}>{sg}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs /60">Buscar artista</label>
          <input className="w-full bg-white/5 border /10 rounded px-3 py-2" placeholder="Ej: Charlotte de Witte" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => <Chip key={s.id} onRemove={() => remove(s.id)}>{s.name}</Chip>)}
        </div>
      )}

      <div className="rounded border /10 bg-white/[0.02] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm /70">{loading ? "Cargando artistas…" : `Resultados: ${filtered.length}`}</div>
        </div>
        {filtered.length === 0 ? (
          <div className="/60 text-sm">No hay artistas para este filtro.</div>
        ) : (
          <>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {display.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded border /10 bg-black/30 p-2">
                  <figure className="w-10 h-10 rounded overflow-hidden border /10 bg-white/5 shrink-0">
                    {a.fotoPerfilUrl ? <img src={a.fotoPerfilUrl} alt={a.nombre_artistico} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-[10px] /60">Artista</div>}
                  </figure>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{a.nombre_artistico}</div>
                    <div className="text-xs /60 truncate">{a.generos?.slice(0,3).join(" • ")}{a.generos?.length>3?" • …":""}</div>
                  </div>
                  <button type="button" className="px-2 py-1 rounded bg-[#FE8B02] hover:bg-[#7b1fe0] text-xs" onClick={() => add(a)}>Agregar</button>
                </li>
              ))}
            </ul>
            {filtered.length > 9 && (
              <div className="mt-3 flex justify-center">
                <button type="button" className="text-xs px-3 py-1.5 rounded bg-white/10 hover:bg-white/15" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Mostrar menos" : "Mostrar más"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
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

  // Registrar views en embudo (solo una vez por sesión/evento)
  useEffect(() => {
    if (!id) return;
    guardOnceED(`funnel:view:${id}`, () => bumpFunnelED(id, "views"));
  }, [id]);

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
  const [ticketTypes, setTicketTypes] = useState<TicketTypeDraft[]>([]);
  const [newVenueOpen, setNewVenueOpen] = useState(false);

  // Cantidades por tipo de ticket
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [cartQty, setCartQty] = useState<number>(() => countCart());
  const [lockModal, setLockModal] = useState(false);
  // Excepción: carrito con entradas de otro evento
  const [eventConflictModalOpen, setEventConflictModalOpen] = useState(false);

  // Agregar al carrito con validación de evento único (móvil/web)
  function handleAddToCart(t: TicketTypeDoc) {
    // Si ya hay entradas en el carrito de OTRO evento => mostrar modal y salir
    const items = readCart();
    if (items.length > 0 && items.some((it) => it.eventId !== id)) {
      setEventConflictModalOpen(true);
      return;
    }

    const qty = qtyMap[t.id || t.name] ?? 1;

    addToCart({
      eventId: id!,
      eventName: nombre,
      eventImage: flyer,
      eventStart: startISO || null,
      eventEnd: endISO || null,
      ticketId: t.id || "",
      ticketName: t.name,
      price: Number(t.price || 0),
      currency: eventNew?.moneda || "CLP",
      qty,
      ticketPath: t.id ? `evento/${id}/ticketTypes/${t.id}` : null,
      addedAt: Date.now(),
    });

    setCartQty(countCart());
    toast.success("Agregado al carrito");
  }
  const getMaxQty = (t: TicketTypeDoc) => {
    const stock = Math.max(1, t.stockDisponible ?? 0);
    const perTicketLimit =
      Number(t.perUserLimit ?? 0) || Number(eventNew?.perUserLimit ?? 0) || 10;
    return Math.max(1, Math.min(stock, perTicketLimit));
  };

  // ====== FORM (como Event.tsx) ======
  const methods = useForm<EventFormValues>({ resolver, mode: "onChange" });
  const venderTickets = methods.watch("venderTickets");
  const perUserLimit = methods.watch("perUserLimit");

  // Artistas seleccionados (edición)
  type ArtistPublic = { id: string; name: string; fotoPerfilUrl?: string | null; slug?: string | null };
  const [lineupPublic, setLineupPublic] = useState<ArtistPublic[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    const ids = eventNew?.artistasIds || [];
    const names = eventNew?.artistasNombres || [];
    if (!ids.length) { setLineupPublic([]); return; }
    let alive = true;
    (async () => {
      try {
        const base = collection(firebaseDb as Firestore, "Artistas");
        const entries: ArtistPublic[] = [];
        for (let i = 0; i < ids.length; i++) {
          const aid = ids[i];
          try {
            const aSnap = await getDoc(doc(base, aid));
            if (aSnap.exists()) {
              const d = aSnap.data() as any;
              entries.push({
                id: aid,
                name: d.nombre_artistico || names[i] || "Artista",
                fotoPerfilUrl: d.fotoPerfilUrl || null,
                slug: d.slug || d.slugUrl || null,
              });
            } else {
              entries.push({ id: aid, name: names[i] || "Artista" });
            }
          } catch {
            entries.push({ id: aid, name: names[i] || "Artista" });
          }
        }
        if (alive) setLineupPublic(entries);
      } catch {
        if (alive) setLineupPublic(ids.map((aid, i) => ({ id: aid, name: names[i] || "Artista" })));
      }
    })();
    return () => { alive = false; };
  }, [eventNew?.artistasIds, eventNew?.artistasNombres]);

  // Géneros desde MUSIC_GENRES (subgéneros guardados)
  const [allGenres] = useState(() => MUSIC_GENRES.map((g) => ({ id: g.slug, main: g.genre, subs: g.subgenres })));
  const [evMainGenre, setEvMainGenre] = useState<string>("");
  const [evSubs, setEvSubs] = useState<string[]>([]);

  // Teléfono con prefijo
  const [phoneCountry, setPhoneCountry] = useState<string>("56");
  const [phoneLocal, setPhoneLocal] = useState<string>("");

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
          setEventNew(ev as any);

          // Tickets existentes -> TicketTypeDraft (fix tipos)
          try {
            const tSnap = await getDocs(collection(firebaseDb as Firestore, `evento/${id}/ticketTypes`));
            if (alive) {
              const list = tSnap.docs
                .map((d) => ({ id: d.id, ...(d.data() as TicketTypeDoc) }))
                .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
              setTickets(list as any);
              setTicketTypes(
                (list as TicketTypeDoc[]).map((d, i) => ({
                  id: d.id,
                  name: d.name,
                  price: d.price,
                  stockTotal: d.stockTotal,
                  stockDisponible: typeof d.stockDisponible === 'number' ? d.stockDisponible : d.stockTotal,
                  perUserLimit: d.perUserLimit ?? undefined,
                  activo: d.activo,
                  orden: typeof d.orden === 'number' ? d.orden : i + 1,
                }))
              );
            }
          } catch {}

          // Prefill form
          const start = ev.fechaInicio ? new Date(ev.fechaInicio) : null;
          const end = ev.fechaFin ? new Date(ev.fechaFin) : null;

          // Teléfono -> prefijo y local
          const tel = ev.telefono || "";
          const m = String(tel).match(/^\+(\d{1,3})(\d{6,12})$/);
          if (m) { setPhoneCountry(m[1]); setPhoneLocal(m[2]); }

          // Subgéneros guardados
          setEvSubs(Array.isArray(ev.generos) ? ev.generos : []);

          // Artistas preseleccionados
          const ids = ev.artistasIds || [];
          const names = ev.artistasNombres || [];
          let pre: { id: string; name: string }[] = [];
          if (ids.length && names.length === ids.length) {
            pre = ids.map((id, i) => ({ id, name: names[i] }));
          } else if (ids.length) {
            const base = collection(firebaseDb as Firestore, "Artistas");
            const fetched: { id: string; name: string }[] = [];
            for (const aid of ids) {
              try {
                const aSnap = await getDoc(doc(base, aid));
                if (aSnap.exists()) {
                  const d = aSnap.data() as any;
                  fetched.push({ id: aid, name: d.nombre_artistico || "Artista" });
                }
              } catch {}
            }
            pre = fetched;
          }
          setSelectedArtists(pre);

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
            edad: String(ev.edad ?? 18) as any,
            dress_code: ev.dress_code || "",
            flyer: null as any,
            imgSec: null as any,
            clubId: ev.clubId || "",
            venderTickets: !!ev.venderTickets,
            perUserLimit: Number(ev.perUserLimit ?? 0),
            ventaAbre: ev.ventaAbre ? new Date(ev.ventaAbre).toISOString().slice(0,16) : "",
            ventaCierra: ev.ventaCierra ? new Date(ev.ventaCierra).toISOString().slice(0,16) : "",
            generosOtro: "",
            artistasIds: ids,
          } as any);

          if (ev.clubId) {
            try {
              const clubRef = doc(firebaseDb as Firestore, "club", ev.clubId);
              const clubSnap = await getDoc(clubRef);
              if (alive && clubSnap.exists()) setClub(clubSnap.data() as ClubDoc);
            } catch {}
          }

          setLoading(false);
          return;
        }

        // Compat/legacy (se mantiene el diseño, sólo prefill)
        const oldRef = doc(firebaseDb as Firestore, "evento", id);
        const oldSnap = await getDoc(oldRef);
        if (oldSnap.exists()) {
          const data = oldSnap.data() as EventLegacy;
          if (!alive) return;
          setEventLegacy({ id, ...data });

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
            flyer: null as any,
            imgSec: null as any,
            clubId: (data as any).clubId || "",
            venderTickets: false,
            perUserLimit: 0,
            ventaAbre: "",
            ventaCierra: "",
            generosOtro: "",
            artistasIds: [],
          } as any);

          setLoading(false);
          return;
        }

        toast.error("No se encontró el evento.");
      } catch {
        toast.error("No se pudo cargar el evento.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ---------- Derivados (vista pública) ----------
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

  // ======= Permisos =======
  const extractUid = (val?: string | null) => {
    if (!val) return null;
    // If it's already a bare UID (no slashes), return as-is
    if (!String(val).includes("/")) return String(val);
    // Otherwise, try to extract the last path segment
    const parts = String(val).split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  };
  const ownerUid = extractUid(eventNew?.uid_usersWeb || eventLegacy?.uid_usersWeb);
  // Permisos: detectar "admin" con máxima tolerancia (boolean, claim, array u objeto, mayúsculas/minúsculas)
  function hasAdmin(u: any): boolean {
    if (!u) return false;
    // 1) Direct flags/claims commonly used
    if (u.isAdmin === true) return true;
    if (u.role && String(u.role).toLowerCase() === "admin") return true;
    if (u.claims?.admin === true || u.customClaims?.admin === true) return true;

    // 2) Roles may come as array or object
    if (Array.isArray(u.roles) && u.roles.some((r: any) => String(r).toLowerCase() === "admin")) return true;
    if (u.roles && typeof u.roles === "object" && Object.keys(u.roles).some((k) => String(k).toLowerCase() === "admin" && (u.roles as any)[k])) return true;

    // 3) Safety net: allowlist for known admin emails (optional)
    const ADMIN_EMAILS = ["pablo@goupevents.cl"]; // agrega aquí otros emails admin si corresponde
    if (u.email && ADMIN_EMAILS.includes(String(u.email).toLowerCase())) return true;

    return false;
  }

  const isAdmin = hasAdmin(user);
  const canEdit = !!user && (isAdmin || (ownerUid ? String(user.uid) === String(ownerUid) : false));

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

  // ---------- Validaciones cruzadas ----------
  const validateCross = (data: EventFormValues): { ok: boolean; msg?: string } => {
    const start = combineDateTime(data.fecha, data.horaInicio);
    const end = combineDateTime(data.fechaFin, data.horaCierre);
    if (!start || !end) return { ok: true };
    if (end.getTime() < start.getTime()) return { ok: false, msg: "La fecha/hora de fin no puede ser anterior al inicio." };
    if (data.ventaAbre || data.ventaCierra) {
      const ventaAbre = data.ventaAbre ? new Date(data.ventaAbre) : null;
      const ventaCierra = data.ventaCierra ? new Date(data.ventaCierra) : null;
      if (ventaAbre && ventaCierra && ventaCierra.getTime() < ventaAbre.getTime()) return { ok: false, msg: "La venta cierra no puede ser anterior a la venta abre." };
      if (ventaCierra && start && ventaCierra.getTime() > start.getTime()) return { ok: false, msg: "La venta debe cerrar antes de que comience el evento." };
    }
    return { ok: true };
  };

  // ---------- Guardar (nuevo esquema) ----------
  const onConfirmSaveNew = async (values: EventFormValues) => {
    if (!canEdit) { toast.error("No tienes permisos para editar este evento."); return; }
    setSaving(true);
    try {
      const newFlyer = values.flyer instanceof File ? await uploadImage(values.flyer, "flyer") : null;
      const newImgSec = values.imgSec instanceof File ? await uploadImage(values.imgSec, "imgSec") : null;

      const start = combineDateTime(values.fecha, values.horaInicio);
      const end = combineDateTime(values.fechaFin, values.horaCierre);

      const telefonoE164 = (() => {
        const digits = String(phoneLocal).replace(/\D/g, "");
        return digits ? `+${phoneCountry}${digits}` : (eventNew?.telefono ?? null);
      })();

      const payload: Partial<EventNew> = {
        tipo: values.tipo,
        fechaInicio: start ? start.toISOString() : null,
        fechaFin: end ? end.toISOString() : null,
        clubId: values.clubId,
        capacidad: values.capacidad,
        presupuesto: values.presupuesto || null,
        promotor: values.promotor,
        telefono: telefonoE164 || null,
        email: values.email,
        descripcion: values.desc || "",
        generos: evSubs, // subgéneros
        edad: Number(values.edad ?? 18),
        dress_code: values.dress_code,

        // NUEVO lineup
        artistasIds: selectedArtists.map((a) => a.id),
        artistasNombres: selectedArtists.map((a) => a.name),

        flyer: newFlyer ?? eventNew?.flyer ?? null,
        imgSec: newImgSec ?? eventNew?.imgSec ?? null,
        venderTickets: !!values.venderTickets,
        moneda: (eventNew?.moneda as any) || "CLP",
        perUserLimit: Math.max(0, Number(values.perUserLimit ?? 0)),
        ventaAbre: values.ventaAbre ? new Date(values.ventaAbre).toISOString() : null,
        ventaCierra: values.ventaCierra ? new Date(values.ventaCierra).toISOString() : null,

        // VIP / reservas (compat)
        ...(typeof (values as any).reservas !== "undefined" ? { aceptaReservas: asBool((values as any).reservas) } : {}),
        cantidadZonasVip: vipToCount((values as any).tieneVip),
        tieneVip: vipToCount((values as any).tieneVip) > 0,
      };

      await updateDoc(doc(firebaseDb as Firestore, "evento", id!), payload as any);
      if (values.venderTickets) {
        if (ticketTypes.length === 0) {
          toast.error("Agrega al menos un tipo de ticket o desactiva la venta.");
          setSaving(false);
          return;
        }
        const colRef = collection(firebaseDb as Firestore, `evento/${id}/ticketTypes`);
        const writes = ticketTypes.map((t, i) => {
          const docRef = t.id
            ? doc(firebaseDb as Firestore, `evento/${id}/ticketTypes/${t.id}`)
            : doc(colRef);
          return setDoc(docRef, {
            name: t.name,
            price: Math.max(0, Number(t.price)),
            stockTotal: Math.max(0, Number(t.stockTotal)),
            stockDisponible:
              typeof t.stockDisponible === 'number'
                ? Math.max(0, Number(t.stockDisponible))
                : Math.max(0, Number(t.stockTotal)),
            perUserLimit: t.perUserLimit == null ? null : Math.max(0, Number(t.perUserLimit)),
            orden: typeof t.orden === 'number' ? t.orden : i + 1,
            activo: !!t.activo,
          });
        });
        await Promise.all(writes);
      }
      toast.success("Datos guardados");
      setEventNew({ ...(eventNew as any), ...payload } as any);
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

  // Toolbar submit
  const handleToolbarSave = () => {
    // Ejecuta la validación de RHF + Zod y muestra feedback si falla
    methods.handleSubmit(
      (values) => {
        const cross = validateCross(values);
        if (!cross.ok) {
          toast.error(cross.msg || "Revisa las fechas del evento y ventas.");
          return;
        }
        setConfirmOpen(true);
      },
      (errors) => {
        // Tomar el primer error y enfocarlo
        const keys = Object.keys(errors || {});
        const firstKey = (keys[0] || "") as keyof EventFormValues | "";
        const firstError: any = firstKey ? (errors as any)[firstKey] : null;
        const msg = firstError?.message || "Revisa los campos requeridos.";
        toast.error(msg);
        // Intentar enfocar el primer campo con error
        if (firstKey) {
          try {
            // RHF intentará enfocarlo si el registro mantiene el ref
            methods.setFocus(firstKey as any, { shouldSelect: true });
          } catch {}
          // Fallback: scroll al elemento si existe un marcador data-name
          try {
            const el = document.querySelector(`[data-rhf-name="${String(firstKey)}"]`) as HTMLElement | null;
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch {}
        }
        try { console.error("Form errors:", errors); } catch {}
      }
    )();
  };

  /* ===================== Render ===================== */
  if (loading) return <div className="p-6 ">Cargando…</div>;
  if (!eventNew && !eventLegacy) {
    return (
      <div className="p-6 ">
        <p>No se encontró el evento.</p>
        <Link to="/mis-eventos" className="text-[#FE8B02] underline">Volver a mis eventos</Link>
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
      {/* Modal: conflicto de evento en carrito */}
      {eventConflictModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEventConflictModalOpen(false)} />
          <div className="relative z-[101] w-[92vw] max-w-sm rounded-lg border border-white/10 bg-neutral-900 p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-[#cbb3ff]">Tu carrito ya tiene otro evento</h3>
            <p className="mt-2 text-sm text-white/80">
              Solo puedes tener un tipo de evento por carrito. Finaliza o vacía tu carrito actual para agregar entradas de este evento.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-2 rounded border border-white/20 bg-white/10 hover:bg-white/15"
                onClick={() => setEventConflictModalOpen(false)}
              >
                Entendido
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded bg-[#FE8B02] hover:bg-[#7b1fe0]"
                onClick={() => navigate(CART_ROUTE)}
              >
                Ir a mi carrito
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===== HERO ===== */}
      <section className="relative isolate w-full overflow-visible md:-mb-12 lg:-mb-16">
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
                className="absolute inset-0 w-full h-full object-cover scale-[1.35] blur-[72px] opacity-[0.75]"
              />
              <div className="absolute inset-0 [background:radial-gradient(1200px_560px_at_64%_32%,rgba(0,0,0,0)_0%,rgba(0,0,0,.55)_60%,rgba(0,0,0,.98)_100%)]" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/80" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#201022] via-[#2b1638] to-black" />
          )}
        </div>

        {/* Contenido */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-6 md:pt-12 pb-8 md:pb-14">
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
                    className="inline-flex w-9 h-9 items-center justify-center rounded bg-black/60 hover:bg-black/75 border border-white/15"
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
              <div className="mt-3 mb-6 md:mb-8 flex items-center gap-2 relative">
                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer"
                    title="WhatsApp"
                    aria-label="WhatsApp"
                    className="inline-flex w-9 h-9 items-center justify-center rounded border border-white/15 bg-black/60 hover:bg-black/75"
                  >
                    <SiWhatsapp className="w-4 h-4" />
                  </a>
                )}
                {mailHref && (
                  <a
                    href={mailHref}
                    title="Correo"
                    aria-label="Correo"
                    className="inline-flex w-9 h-9 items-center justify-center rounded border border-white/15 bg-black/60 hover:bg-black/75"
                  >
                    <MdOutlineMail className="w-4 h-4" />
                  </a>
                )}
                <button
                  title="Compartir"
                  aria-label="Compartir"
                  onClick={() => { if (navigator.share) { navigator.share({ title: nombre, url: location.href }).catch(() => {}); } else { setShareOpen((v) => !v); } }}
                  className="inline-flex w-9 h-9 items-center justify-center rounded border border-white/15 bg-black/60 hover:bg-black/75"
                >
                  <FiShare2 className="w-4 h-4" />
                </button>

                {shareOpen && (
                  <div className="absolute top-11 left-0 z-40 rounded border border-white/10 bg-black/80 backdrop-blur px-3 py-2 text-sm shadow-lg">
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
              <div className="flex items-center justify-between mb-5 gap-3 flex-wrap relative z-[2]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded border ${isPast ? "bg-white/10 border-white/20 text-white/80" : "bg-[#FE8B02]/30 border-[#FE8B02]/50 text-[#e4d7ff]"}`}>
                    {isPast ? "Realizado" : "Próximo"}
                  </span>
                  {edad ? <span className="text-xs px-2 py-1 rounded bg-black/40 border border-white/15">+{edad}</span> : null}
                  {dressCode ? <span className="text-xs px-2 py-1 rounded bg-black/40 border border-white/15">Dress code: {dressCode}</span> : null}
                </div>
                <Link
                  to="/eventos"
                  className="inline-flex items-center gap-2 text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-1.5 rounded border /10 bg-black/40 hover:bg-black/60 text-[#cbb3ff] ml-auto shrink-0 mt-2 md:mt-0 relative z-[3]"
                >
                  <FiArrowLeft className="w-4 h-4" />
                  <span>Volver a eventos</span>
                </Link>
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
                        {startISO ? fmtTimeShort(startISO) : "—"} {endISO ? `– ${fmtTimeShort(endISO)}` : ""}
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

              <div className="h-2 md:h-3" />

              {/* Localidad */}
              <section className="rounded border border-white/15 bg-white/[0.03] backdrop-blur p-4 relative z-[1]">
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
                        className="px-3 py-1 rounded bg-white/10 hover:bg-white/15 border border-white/15 text-xs md:text-sm"
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
                        className="px-3 py-1 rounded bg-white/10 hover:bg-white/15 border border-white/15 text-xs md:text-sm"
                      >
                        Waze
                      </a>
                    </div>
                  )}
                </div>
                {club ? (
                  <div className="space-y-1">
                    <p className="font-semibold">{club.nombre}</p>
                    <p className="/80 text-sm">{[club.direccion, club.ciudad, club.pais].filter(Boolean).join(", ")}</p>
                  </div>
                ) : (
                  <p className="/60 text-sm">Sin localidad asociada.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      </section>


      {/* CONTENIDO bajo el hero */}
      <div className="max-w-6xl mx-auto px-4 pb-10">
        {/* Toolbar acciones (siempre visible; cambia según modo) */}
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3 relative z-20">
          <div className="flex flex-col sm:flex-row gap-3">
            {canEdit && (
              <div className="flex flex-col sm:flex-row gap-3">
                {!editMode ? (
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="px-4 py-2 min-w-[160px] rounded bg-[#FE8B02]/40 hover:bg-[#7b1fe0] transition w-full sm:w-auto"
                  >
                    Editar datos
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      className="px-4 py-2 min-w-[160px] rounded border /20 hover:bg-white/10 w-full sm:w-auto"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleToolbarSave}
                      className="px-4 py-2 min-w-[160px] rounded bg-[#FE8B02] hover:bg-[#7b1fe0] w-full sm:w-auto"
                    >
                      Guardar cambios
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(true)}
                      className="px-4 py-2 min-w-[160px] rounded bg-rose-600/70 hover:bg-rose-500 w-full sm:w-auto"
                    >
                      Eliminar evento
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <Link
            to={CART_ROUTE}
            className="px-3 py-2 rounded font-semibold inline-flex items-center gap-2 bg-[#FE8B02] hover:bg-[#7b1fe0]"
          >
            <CartIcon className="w-4 h-4" />
            <span>Ir a tu carrito</span>
            <span className="ml-1 text-black bg-white rounded min-w-5 h-5 px-2 grid place-items-center text-xs">
              {cartQty}
            </span>
          </Link>
        </div>
        {!editMode && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Columna principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* Entradas */}
              <section className="rounded border /10 bg-white/[0.03] backdrop-blur p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-lg font-bold text-[#cbb3ff]">Entradas</h2>
                  <div className="flex items-center gap-2">
                    {eventNew?.venderTickets ? (
                      <span className="text-xs /60 hidden sm:inline">Tope por usuario: {eventNew?.perUserLimit ?? 0}</span>
                    ) : null}
                  </div>
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
                          className="rounded border /10 bg-white/[0.04] p-4 flex flex-col sm:flex-row gap-3 sm:items-center"
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
                                className="px-2 py-1 goup-select text-sm w-full sm:w-12"
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
                              className={`px-3 py-2 rounded /90 w-full sm:w-auto ${
                                puedeComprar ? "bg-white/10 hover:bg-white/15" : "bg-white/10 disabled:opacity-60 cursor-not-allowed"
                              }`}
                              onClick={() => puedeComprar && handleAddToCart(t)}
                            >
                              Añadir al carrito
                            </button>

                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Descripción */}
              {desc && (
                <section className="rounded border /10 bg-white/[0.03] backdrop-blur p-5">
                  <h2 className="text-lg font-bold text-[#cbb3ff] mb-2">Descripción</h2>
                  <p className="/80 leading-relaxed">{desc}</p>
                </section>
              )}

              {/* Line-up (adaptado a artistasNombres si existen) */}
              {(eventNew?.artistasNombres && eventNew.artistasNombres.length > 0) && (
                <section className="rounded border /10 bg-white/[0.03] backdrop-blur p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-[#cbb3ff]">Line-up</h2>
                    <span className="text-xs /60">{eventNew.artistasNombres.length} artista(s)</span>
                  </div>
                  <ul className="mt-3 grid sm:grid-cols-2 gap-2">
                    {(lineupPublic.length ? lineupPublic : (eventNew.artistasNombres || []).map((n, i) => ({ id: String(i), name: n })) ).map((a, i) => (
                      <li key={`${a.id}-${i}`} className="px-3 py-2 rounded border /10 bg-white/5 text-sm flex items-center gap-2">
                        <span className="inline-flex w-6 h-6 rounded bg-[#FE8B02]/30 border border-[#FE8B02]/50 text-center items-center justify-center text-xs">{i + 1}</span>
                        {('slug' in a || 'fotoPerfilUrl' in a) ? (
                          <Link to={`/artistas/${(a as any).slug || a.id}`} className="min-w-0 flex items-center gap-2 hover:underline">
                            <figure className="w-7 h-7 rounded overflow-hidden border /10 bg-white/5 shrink-0">
                              {(a as any).fotoPerfilUrl ? (
                                <img src={(a as any).fotoPerfilUrl} alt={a.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full grid place-items-center text-[10px] /60">DJ</div>
                              )}
                            </figure>
                            <span className="truncate">{a.name}</span>
                          </Link>
                        ) : (
                          <span className="truncate">{a.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Galería */}
              <section className="rounded border /10 bg-white/[0.03] backdrop-blur p-5">
                <h2 className="text-lg font-bold text-[#cbb3ff] mb-3">Galería</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <figure className="rounded overflow-hidden border /10">
                    {flyer ? (
                      <img src={flyer} className="w-full h-64 object-cover" alt="Flyer" />
                    ) : (
                      <div className="w-full h-64 grid place-items-center /40 bg-white/5">Sin flyer</div>
                    )}
                  </figure>
                  <figure className="rounded overflow-hidden border /10">
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
                      ? `${startISO ? fmtTimeShort(startISO) : "—"}${endISO ? ` – ${fmtTimeShort(endISO)}` : ""}`
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
      </div>

      {/* Toolbar acciones */}
      <div className="relative z-10 max-w-6xl mx-auto px-2 pt-8 md:pt-8 pb-10 md:pb-14">

        {/* ==================== EDICIÓN (mismo form que crear) ==================== */}
        {editMode && (
          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit(
                (values) => {
                  const cross = validateCross(values);
                  if (!cross.ok) {
                    toast.error(cross.msg || "Revisa las fechas del evento y ventas.");
                    return;
                  }
                  setConfirmOpen(true);
                },
                (errors) => {
                  const keys = Object.keys(errors || {});
                  const firstKey = (keys[0] || "") as keyof EventFormValues | "";
                  const firstError: any = firstKey ? (errors as any)[firstKey] : null;
                  const msg = firstError?.message || "Revisa los campos requeridos.";
                  toast.error(msg);
                  if (firstKey) {
                    try { methods.setFocus(firstKey as any, { shouldSelect: true }); } catch {}
                    try {
                      const el = document.querySelector(`[data-rhf-name="${String(firstKey)}"]`) as HTMLElement | null;
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    } catch {}
                  }
                }
              )}
              className="space-y-6 mt-2"
              noValidate
            >
              {/* Info evento */}
              <Section title="Información del evento">
                <div className="grid md:grid-cols-2 gap-4">
                  <RHFInput
                    name="nombre"
                    label="Nombre del Evento *"
                    placeholder="Ej: PURPLE NIGHTS • MIDNIGHT VIBES"
                  />
                  <RHFSelect
                    name="tipo"
                    label="Tipo de evento *"
                    options={["Club", "Festival", "After", "Privado", "Open Air", "Bar", "Otro"]}
                  />
                </div>
              </Section>

              {/* Localidad & tickets */}
              <Section title="Localidad & tickets">
                <div className="space-y-4">
                  <VenueCombo
                    value={methods.watch("clubId")}
                    onChange={(clubId) =>
                      methods.setValue("clubId", clubId, { shouldValidate: true })
                    }
                    onNewVenue={() => setNewVenueOpen(true)}
                  />

                  <div className="rounded border /10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <label htmlFor="sell" className="font-medium">
                        Vender tickets
                      </label>
                      <input
                        id="sell"
                        type="checkbox"
                        className="h-5 w-5 accent-[#FE8B02]"
                        checked={!!venderTickets}
                        onChange={(e) =>
                          methods.setValue("venderTickets", e.target.checked)
                        }
                      />
                    </div>

                    {venderTickets && (
                      <div className="mt-4 space-y-4">
                        <div className="grid md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs /60">
                              Tope por usuario (global)
                            </label>
                            <input
                              type="number"
                              min={0}
                              className="w-full bg-white/5  placeholder-white/40 border /10 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FE8B02]"
                              value={Number(perUserLimit || 0)}
                              onChange={(e) =>
                                methods.setValue(
                                  "perUserLimit",
                                  Math.max(0, Number(e.target.value) || 0),
                                  { shouldValidate: true }
                                )
                              }
                            />
                          </div>
                          <RHFInput name="ventaAbre" type="datetime-local" label="Venta abre" />
                          <RHFInput name="ventaCierra" type="datetime-local" label="Venta cierra" />
                        </div>

                        {/* Editor de tipos de ticket (misma UX que crear) */}
                        <div className="rounded border /10 bg-white/[0.02] p-3 md:p-4">
                          {/* NOTA: el estado y persistencia se manejan al confirmar guardado */}
                          <TicketTypesEditor
                            // @ts-ignore: declaramos más abajo el estado en el componente
                            value={ticketTypes}
                            onChange={(list) => setTicketTypes(list)}
                            perUserLimitGlobal={
                              typeof perUserLimit === "number"
                                ? perUserLimit
                                : Number(perUserLimit || 0)
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Section>

              {/* Artistas */}
              <Section title="Artistas (DJs)">
                <p className="text-sm /70 mb-3">
                  Agrega o quita los artistas que tocarán. (Se guardan sus IDs y nombres).
                </p>
                <ArtistPicker
                  selected={selectedArtists}
                  setSelected={setSelectedArtists}
                />
              </Section>

              {/* Fecha & horario */}
              <Section title="Fecha & horario">
                <div className="grid md:grid-cols-4 gap-4">
                  <RHFInput name="fecha" type="date" label="Fecha de inicio *" />
                  <RHFInput name="horaInicio" type="time" label="Hora de inicio *" />
                  <RHFInput name="fechaFin" type="date" label="Fecha de término *" />
                  <RHFInput name="horaCierre" type="time" label="Hora de término *" />
                </div>
              </Section>

              {/* Capacidad */}
              <Section title="Capacidad">
                <RHFSelect
                  name="capacidad"
                  label="Capacidad esperada *"
                  options={["0 a 500", "501 a 1000", "1001 a 2000", "Más de 2 000"]}
                />
              </Section>

              {/* Contacto */}
              <Section title="Contacto del organizador">
                <div className="grid md:grid-cols-3 gap-4">
                  <RHFInput name="promotor" label="Promotor *" />
                  {/* Teléfono con prefijo (igual que crear) */}
                  <div>
                    <label className="text-sm font-medium">Teléfono *</label>
                    <div className="flex py-1 items-center gap-2">
                      <select
                        className="w-20 sm:w-24 bg-white/5 border /10 rounded px-2 py-2 h-[42px] text-sm text-center goup-select"
                        value={phoneCountry}
                        onChange={(e) => setPhoneCountry(e.target.value)}
                      >
                        {/* Lista reducida; puedes reutilizar la constante del create si la tienes exportada */}
                        <option value="56">(+56)</option>
                        <option value="54">(+54)</option>
                        <option value="57">(+57)</option>
                        <option value="52">(+52)</option>
                        <option value="1">(+1)</option>
                      </select>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="flex-1 bg-white/5 border /10 rounded px-3 py-2 "
                        placeholder="Número sin prefijo (mín. 9 dígitos)"
                        value={phoneLocal}
                        onChange={(e) => setPhoneLocal(e.target.value)}
                      />
                    </div>
                    <p className="mt-1 px-1 text-xs /60">
                      Se guardará como{" "}
                      <span className="font-mono">
                        +{phoneCountry} {String(phoneLocal).replace(/\D/g, "")}
                      </span>
                    </p>
                  </div>
                  <RHFInput name="email" type="email" label="Email *" />
                </div>
              </Section>

              {/* Concepto & experiencia */}
              <Section title="Concepto & experiencia">
                <RHFTextarea name="desc" label="Descripción *" rows={4} />

                {/* Selección de subgéneros (mismo patrón de crear) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Género musical del evento (solo para filtrar subgéneros — lo que se guarda son los subgéneros)
                  </label>
                  <div className="grid gap-3 ">
                    <div>
                      <label className="text-xs /60">Género (filtro visual, no se guarda)</label>
                      <select
                        className="goup-select"
                        value={evMainGenre}
                        onChange={(e) => setEvMainGenre(e.target.value)}
                      >
                        <option value="">Selecciona un género</option>
                        {allGenres.map((g) => (
                          <option key={g.id} value={g.main}>
                            {g.main}
                          </option>
                        ))}
                      </select>
                      <div className="py-1">
                        <label className="text-xs">
                          Subgéneros (puedes elegir varios) — solo estos se guardan
                        </label>
                        <h2 className="py-1"></h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 max-h-56 overflow-y-auto p-2 py-1 rounded border /10 bg-white/[0.02]">
                          {(
                            allGenres.find((g) => g.main === evMainGenre)?.subs ?? []
                          ).map((sg) => {
                            const active = evSubs.includes(sg);
                            return (
                              <button
                                key={sg}
                                type="button"
                                onClick={() =>
                                  setEvSubs((prev) =>
                                    prev.includes(sg)
                                      ? prev.filter((x) => x !== sg)
                                      : [...prev, sg]
                                  )
                                }
                                className={`text-left px-2 py-2 rounded border /10 w-full text-xs ${
                                  active
                                    ? "bg-[#FE8B02]/20 border-[#FE8B02]/40"
                                    : "bg-white/5"
                                }`}
                              >
                                {sg}
                              </button>
                            );
                          })}
                          {!evMainGenre && (
                            <div className="col-span-2 text-xs /60">
                              Primero selecciona un género para ver sus subgéneros.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {evSubs.length > 0 && (
                    <div className="pt-1">
                      <div className="text-xs /60 mb-1">Subgéneros seleccionados:</div>
                      <div className="flex flex-wrap gap-2">
                        {evSubs.map((sg) => (
                          <span
                            key={sg}
                            className="inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded px-3 py-1 text-xs"
                          >
                            {sg}
                            <button
                              type="button"
                              className="ml-1 rounded w-5 h-5 grid place-items-center bg-white/10 hover:bg-white/20"
                              onClick={() =>
                                setEvSubs((prev) => prev.filter((x) => x !== sg))
                              }
                              aria-label={`Quitar ${sg}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* Políticas */}
              <Section title="Políticas del evento">
                <div className="grid md:grid-cols-3 gap-4">
                  <RHFSelect
                    name="edad"
                    label="Edad mínima *"
                    options={Array.from({ length: 53 }, (_, i) => `${i + 18}`)}
                  />
                  <RHFSelect
                    name="dress_code"
                    label="Dress code *"
                    options={["Casual", "Formal", "Semi-formal", "Urbano", "Temático"]}
                  />
                  <RHFSelect
                    name="reservas"
                    label="¿Acepta reservas?"
                    options={["Sí", "No"]}
                  />
                </div>
                <div className="grid md:grid-cols-3 gap-4 mt-4">
                  <RHFSelect
                    name="tieneVip"
                    label="¿Zonas VIP?"
                    options={["No", "1", "2", "Más de 5"]}
                  />
                  <div className="hidden md:block" />
                  <div className="hidden md:block" />
                </div>
              </Section>

              {/* Imágenes */}
              <Section title="Imágenes">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <div className="/70 text-sm mb-2">Flyer actual</div>
                    <div className="rounded overflow-hidden border /10 mb-3">
                      {flyer ? (
                        <img
                          src={flyer}
                          alt="Flyer actual"
                          className="w-full h-48 object-cover"
                        />
                      ) : (
                        <div className="w-full h-48 bg-white/10 grid place-items-center /40">
                          Sin flyer
                        </div>
                      )}
                    </div>
                    <RHFFile name="flyer" label="Reemplazar flyer (opcional)" />
                  </div>
                  <div>
                    <div className="/70 text-sm mb-2">Imagen secundaria actual</div>
                    <div className="rounded overflow-hidden border /10 mb-3">
                      {imgSec ? (
                        <img
                          src={imgSec}
                          alt="Imagen secundaria actual"
                          className="w-full h-48 object-cover"
                        />
                      ) : (
                        <div className="w-full h-48 bg-white/10 grid place-items-center /40">
                          Sin imagen secundaria
                        </div>
                      )}
                    </div>
                    <RHFFile
                      name="imgSec"
                      label="Reemplazar imagen secundaria (opcional)"
                    />
                  </div>
                </div>
              </Section>
              {/* === Botones guardar/cancelar al final del formulario === */}
              <div className="flex flex-col sm:flex-row gap-3 pt-6">
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 min-w-[160px] rounded border /20 hover:bg-white/10 w-full sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleToolbarSave}
                  className="px-4 py-2 min-w-[160px] rounded bg-[#FE8B02] hover:bg-[#7b1fe0] w-full sm:w-auto"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </FormProvider>
        )}
      </div>

      {/* Confirm guardar */}
      {confirmOpen && (
        <div className="fixed z-50 inset-0 grid place-items-center bg-black/60">
          <div className="bg-neutral-900 rounded p-6 w-[92vw] max-w-md text-center border /10">
            <h3 className="text-lg font-semibold mb-2">¿Guardar los cambios?</h3>
            <p className="/70 mb-5">Se actualizarán los datos del evento.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button
                className="px-4 py-2 rounded border /20 hover:bg-white/10 w-full sm:w-auto"
                onClick={() => {
                  setConfirmOpen(false);
                  setSaving(false);
                }}
              >
                No
              </button>
              <button
                className="px-4 py-2 rounded bg-[#FE8B02] hover:bg-[#7b1fe0] w-full sm:w-auto"
                disabled={saving}
                onClick={methods.handleSubmit(onConfirmSaveNew)}
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
          <div className="bg-neutral-900 rounded p-6 w-[92vw] max-w-md text-center border border-rose-500/30">
            <h3 className="text-lg font-semibold text-rose-300 mb-2">
              ¿Borrar este evento?
            </h3>
            <p className="/70 mb-5">
              Esta acción es <b>permanente</b> y no hay vuelta atrás.
            </p>
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

      {/* Modal nueva localidad (para edición también) */}
      <NewVenueModal
        open={newVenueOpen}
        onClose={() => setNewVenueOpen(false)}
        onCreated={(clubId, nombre) => {
          methods.setValue("clubId", clubId, { shouldValidate: true });
          toast.success(`Localidad creada: ${nombre}`);
        }}
      />
    {/* Modal: Excepción carrito de otro evento */}
    {eventConflictModalOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/60"
          onClick={() => setEventConflictModalOpen(false)}
        />
        <div className="relative z-10 w-full max-w-md rounded-lg border /10 bg-neutral-900 p-5 shadow-xl">
          <h3 className="text-lg font-semibold mb-2">Carrito limitado a un evento</h3>
          <p className="/80 text-sm mb-4">
            Tu carrito ya contiene entradas de otro evento. Solo puedes comprar entradas de un único evento por transacción.
            Finaliza o vacía tu carrito para agregar entradas de este evento.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded border /10 hover:bg-white/10"
              onClick={() => setEventConflictModalOpen(false)}
            >
              Cerrar
            </button>
            <Link
              to={CART_ROUTE}
              className="px-3 py-1.5 rounded bg-[#FE8B02] hover:bg-[#7b1fe0]"
              onClick={() => setEventConflictModalOpen(false)}
            >
              Ir a tu carrito
            </Link>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

/* ====== Estado local para TicketTypesEditor ======
   (colócalo arriba del return principal si prefieres; lo dejamos aquí al final
   para no interrumpir tu flujo de lectura)
*/
const React_useState = React.useState; // alias local por si el import cambia

// Tip: pon estas líneas cerca de otros useState arriba si prefieres.
// Aquí las exportamos como no-ejecutables; en tu archivo real,
// muévelas junto a los demás "useState" del componente.
declare global {
  interface Window {
    __goup_ticketTypesDraft?: TicketTypeDraft[];
  }
}