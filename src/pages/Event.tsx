// src/pages/Event.tsx
import React, { useEffect, useMemo, useState } from "react";
import { MUSIC_GENRES } from "@/lib/musicGenres";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { eventSchema } from "@/lib/schemas";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

import {
  RHFInput,
  RHFTextarea,
  RHFSelect,
  RHFCheckboxGroup,
  RHFFile,
} from "@/components/form/control";

import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as qLimit,
} from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";

// ★ Venta de tickets + venue
import NewVenueModal from "@/components/venues/NewVenueModal";
import TicketTypesEditor from "@/components/tickets/TicketsEditor";
import type { TicketTypeDraft } from "@/types/commerce";
import VenueCombo from "@/components/venues/VenueComboBox";

/* ----------------------------------------------------------------
   TIPOS
----------------------------------------------------------------- */
type ArtistDoc = {
  id: string;
  nombre_artistico: string;
  generos: string[]; // subgéneros (ej: "Melodic Techno", "House")
  fotoPerfilUrl?: string | null;
  redes?: {
    instagram?: string | null;
    soundcloud?: string | null;
    beatport?: string | null;
    spotify?: string | null;
    website?: string | null;
  };
  status?: "draft" | "published";
};

type MusicGenre = {
  id: string;
  main: string;
  subs: string[];
};

/* -------------------- Schema extendido -------------------- */
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

  // lineup (nuevo modelo)
  artistasIds: z.array(z.string()).default([]), // IDs de Artistas
});

type ExtraSaleFields = z.infer<typeof extraSchema>;
export type EventFormValues = z.infer<typeof eventSchema> & ExtraSaleFields;

const resolver = zodResolver(
  (eventSchema as unknown as z.ZodTypeAny).and(extraSchema)
) as unknown as Resolver<EventFormValues>;

/* -------------------- Defaults -------------------- */
const defaultValues: EventFormValues = {
  nombre: "",
  tipo: "",
  fecha: "",
  horaInicio: "",
  horaCierre: "",
  capacidad: "",
  presupuesto: "",
  promotor: "",
  telefono: "",
  email: "",
  desc: "",
  generos: [],
  flyer: null,
  imgSec: null,
  edad: 18 as any,
  tieneVip: "",
  vip: "",
  reservas: "No" as any,
  // ❌ removemos tieneLineup, cantidadDJs (queda reemplazado por artistasIds)
 // djs: [],
  dress_code: "",
  generosOtro: "",

  clubId: "",
  venderTickets: false,
  perUserLimit: 2,
  ventaAbre: "",
  ventaCierra: "",
  fechaFin: "",

  artistasIds: [],
};

/* -------------------- Utils -------------------- */
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

function combineDateTime(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(d.getTime()) ? null : d;
}

// Notificación no bloqueante al crear evento
async function notifyUsersSafe(params: { eventId: string; genres: string[]; clubId: string }) {
  try {
    const fns = getFunctions();
    if (location.hostname === "localhost") {
      try {
        connectFunctionsEmulator(fns, "127.0.0.1", 5001);
      } catch {}
    }
    const notify = httpsCallable(fns, "notifyUsersForEvent");
    // No bloquear el submit: corta a los 2.5s si demora
    const call = notify(params);
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("notify timeout")), 2500)
    );
    await Promise.race([call, timeout]);
  } catch (e) {
    // No romper el flujo de creación del evento si el aviso falla
    console.warn("notifyUsersForEvent (ignorado):", e);
  }
}

// --- Prefijos telefónicos LATAM + US ---
const LATAM_PHONE_OPTIONS: { code: string; abbr: string }[] = [
  { code: "56", abbr: "" }, // Chile
  { code: "54", abbr: "" }, // Argentina
  { code: "591", abbr: "" }, // Bolivia
  { code: "55", abbr: "" }, // Brasil
  { code: "57", abbr: "" }, // Colombia
  { code: "506", abbr: "" }, // Costa Rica
  { code: "53", abbr: "" }, // Cuba
  { code: "593", abbr: "" }, // Ecuador
  { code: "503", abbr: "" }, // El Salvador
  { code: "502", abbr: "" }, // Guatemala
  { code: "504", abbr: "" }, // Honduras
  { code: "52", abbr: "" }, // México
  { code: "505", abbr: "" }, // Nicaragua
  { code: "507", abbr: "" }, // Panamá
  { code: "595", abbr: "" }, // Paraguay
  { code: "51", abbr: "" }, // Perú
  { code: "1", abbr: "" }, // Puerto Rico
  { code: "1", abbr: "" }, // Estados Unidos
  { code: "598", abbr: "" }, // Uruguay
  { code: "58", abbr: "" }, // Venezuela
  { code: "1", abbr: "" }, // República Dominicana
];

/* -------------------- UI helpers -------------------- */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-[#cbb3ff]">
          {title}
        </h2>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="rounded-xl border border-white/15 bg-white/[0.03] backdrop-blur p-5 md:p-6 shadow-sm">
        {children}
      </div>
    </section>
  );
}

function LoadingButton({
  loading,
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 bg-[#FE8B02] hover:bg-[#7b1fe0] ${className}`}
      disabled={loading}
      {...rest}
    >
      {loading ? "…" : children}
    </button>
  );
}

function SuccessModal({
  open,
  title,
  subtitle,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="max-w-md rounded-xl bg-neutral-900 p-6 text-center shadow-lg border /10">
        <h2 className="mb-2 text-2xl font-semibold text-green-400">{title}</h2>
        {subtitle && <p className="/70">{subtitle}</p>}
        <button
          className="mt-6 rounded bg-[#FE8B02] px-4 py-2 text-sm font-medium hover:bg-[#7b1fe0]"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   ARTIST PICKER (selector + creación inline)
----------------------------------------------------------------- */
function Chip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-3 py-1 text-sm">
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 rounded-full w-5 h-5 grid place-items-center bg-white/10 hover:bg-white/20"
          aria-label="Quitar"
        >
          ×
        </button>
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
  const [newModal, setNewModal] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Cargar musicGenres una vez (desde MUSIC_GENRES)
  useEffect(() => {
    const arr: MusicGenre[] = MUSIC_GENRES.map((g) => ({
      id: g.slug,
      main: g.genre,
      subs: g.subgenres,
    }));
    setGenres(arr);
  }, []);

  // Reset subFilter when mainFilter changes
  useEffect(() => {
    setSubFilter("");
  }, [mainFilter]);

  // Get current sub options and chunk helper
  const currentSubs = useMemo(() => {
    const g = genres.find((g) => g.main === mainFilter);
    return g?.subs ?? [];
  }, [genres, mainFilter]);

  function chunk<T>(arr: T[], size: number) {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  // Buscar artistas usando filtro jerárquico
  const fetchArtists = async () => {
    setLoading(true);
    try {
      const base = collection(firebaseDb as Firestore, "Artistas");
      let results: ArtistDoc[] = [];

      if (subFilter) {
        // 1) Subgénero específico
        const qRef = query(base, where("generos", "array-contains", subFilter), qLimit(50));
        const snap = await getDocs(qRef);
        snap.forEach((d) => {
          const x = d.data() as any;
          results.push({
            id: d.id,
            nombre_artistico: x.nombre_artistico,
            generos: x.generos || [],
            fotoPerfilUrl: x.fotoPerfilUrl || null,
            redes: x.redes || {},
            status: x.status || "published",
          });
        });
      } else if (mainFilter) {
        // 2) Género seleccionado (varios subgéneros)
        const subs = currentSubs;
        if (subs.length === 0) {
          results = [];
        } else if (subs.length <= 10) {
          const qRef = query(base, where("generos", "array-contains-any", subs), qLimit(50));
          const snap = await getDocs(qRef);
          snap.forEach((d) => {
            const x = d.data() as any;
            results.push({
              id: d.id,
              nombre_artistico: x.nombre_artistico,
              generos: x.generos || [],
              fotoPerfilUrl: x.fotoPerfilUrl || null,
              redes: x.redes || {},
              status: x.status || "published",
            });
          });
        } else {
          // Más de 10: hacer varias consultas y unir
          const chunks = chunk(subs, 10);
          const fetched: Record<string, ArtistDoc> = {};
          for (const part of chunks) {
            const qRef = query(base, where("generos", "array-contains-any", part), qLimit(50));
            const snap = await getDocs(qRef);
            snap.forEach((d) => {
              const x = d.data() as any;
              fetched[d.id] = {
                id: d.id,
                nombre_artistico: x.nombre_artistico,
                generos: x.generos || [],
                fotoPerfilUrl: x.fotoPerfilUrl || null,
                redes: x.redes || {},
                status: x.status || "published",
              };
            });
          }
          results = Object.values(fetched);
        }
      } else {
        // 3) Sin filtros: lista general
        const qRef = query(base, orderBy("nombre_artistico"), qLimit(50));
        const snap = await getDocs(qRef);
        snap.forEach((d) => {
          const x = d.data() as any;
          results.push({
            id: d.id,
            nombre_artistico: x.nombre_artistico,
            generos: x.generos || [],
            fotoPerfilUrl: x.fotoPerfilUrl || null,
            redes: x.redes || {},
            status: x.status || "published",
          });
        });
      }

      // Ordenar en memoria por nombre
      results.sort((a, b) => (a.nombre_artistico || "").localeCompare(b.nombre_artistico || ""));
      setList(results);
    } catch (e) {
      console.error("Error cargando artistas:", e);
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainFilter, subFilter]);

  useEffect(() => {
    setShowAll(false);
  }, [mainFilter, subFilter, search]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((a) =>
      a.nombre_artistico?.toLowerCase().includes(s)
    );
  }, [list, search]);

  const displayList = useMemo(() => (showAll ? filtered : filtered.slice(0, 9)), [filtered, showAll]);

  const add = (a: ArtistDoc) => {
    if (selected.some((x) => x.id === a.id)) return;
    setSelected([...selected, { id: a.id, name: a.nombre_artistico }]);
  };
  const remove = (id: string) => {
    setSelected(selected.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs /60">Género</label>
          <select
            className="goup-select"
            value={mainFilter}
            onChange={(e) => {
              setMainFilter(e.target.value);
              setSubFilter("");
            }}
          >
            <option value="">Todos</option>
            {genres.map((g) => (
             <option key={`${g.id}-${g.main}`} value={g.main}>{g.main}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs /60">Subgénero</label>
          <select
            className="goup-select"
            value={subFilter}
            onChange={(e) => setSubFilter(e.target.value)}
            disabled={!mainFilter}
          >
            <option value="">{mainFilter ? "Todos los subgéneros" : "Selecciona un género"}</option>
            {currentSubs.map((sg) => (
              <option key={sg} value={sg}>
                {sg}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-1">
          <label className="text-xs /60">Buscar artista</label>
          <input
            className="w-full bg-white/5 border /10 rounded px-3 py-2"
            placeholder="Ej: Charlotte de Witte"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Seleccionados */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <Chip key={s.id} onRemove={() => remove(s.id)}>
              {s.name}
            </Chip>
          ))}
        </div>
      )}

      {/* Lista */}
      <div className="rounded-lg border /10 bg-white/[0.02] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm /70">
            {loading ? "Cargando artistas…" : `Resultados: ${filtered.length}`}
          </div>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15"
            onClick={() => setNewModal(true)}
          >
            + Agregar artista
          </button>
        </div>
        {filtered.length === 0 ? (
          <div className="/60 text-sm">No hay artistas para este filtro.</div>
        ) : (
          <>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {displayList.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-md border /10 bg-black/30 p-2"
                >
                  <figure className="w-10 h-10 rounded overflow-hidden border /10 bg-white/5 shrink-0">
                    {a.fotoPerfilUrl ? (
                      <img
                        src={a.fotoPerfilUrl}
                        alt={a.nombre_artistico}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-[10px] /60">
                        Artista
                      </div>
                    )}
                  </figure>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {a.nombre_artistico}
                    </div>
                    <div className="text-xs /60 truncate">
                      {a.generos?.slice(0, 3).join(" • ")}
                      {a.generos?.length > 3 ? " • …" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-[#FE8B02] hover:bg-[#7b1fe0] text-xs"
                    onClick={() => add(a)}
                  >
                    Agregar
                  </button>
                </li>
              ))}
            </ul>
            {filtered.length > 9 && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "Mostrar menos" : "Mostrar más"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal nuevo artista */}
      {newModal && (
        <NewArtistModal
          onClose={() => setNewModal(false)}
          onCreated={(doc) => {
            toast.success(`Artista creado: ${doc.nombre_artistico}`);
            setNewModal(false);
            // añadir directamente a seleccionados
            setSelected([
              ...selected,
              { id: doc.id, name: doc.nombre_artistico },
            ]);
            // y refrescar listado
            fetchArtists();
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
   MODAL: Crear Artista rápido
----------------------------------------------------------------- */
function NewArtistModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (a: ArtistDoc) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [subs, setSubs] = useState<string[]>([]);
  const [genres, setGenres] = useState<MusicGenre[]>([]);
  const [mainGenre, setMainGenre] = useState<string>("");
  const [foto, setFoto] = useState<File | null>(null);
  const [redes, setRedes] = useState({
    instagram: "",
    soundcloud: "",
    beatport: "",
    spotify: "",
    website: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const arr: MusicGenre[] = MUSIC_GENRES.map((g) => ({
      id: g.slug,
      main: g.genre,
      subs: g.subgenres,
    }));
    setGenres(arr);
  }, []);

  const currentSubs = React.useMemo(() => {
    const g = genres.find((g) => g.main === mainGenre);
    return g?.subs ?? [];
  }, [genres, mainGenre]);

  const toggleSub = (sg: string) => {
    setSubs((prev) =>
      prev.includes(sg) ? prev.filter((x) => x !== sg) : [...prev, sg]
    );
  };

  const save = async () => {
    if (!nombre.trim()) {
      toast.error("El nombre del artista es obligatorio.");
      return;
    }
    if (subs.length === 0) {
      toast.error("Selecciona al menos un subgénero.");
      return;
    }
    setSaving(true);
    try {
      let fotoPerfilUrl: string | null = null;
      if (foto) {
        const storage = getStorage();
        const ext = foto.name.split(".").pop() || "jpg";
        const path = `Artistas/${Date.now()}.${ext}`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, foto);
        fotoPerfilUrl = await getDownloadURL(ref);
      }

      const newRef = doc(collection(firebaseDb as Firestore, "Artistas"));
      const payload: any = {
        nombre_artistico: nombre.trim(),
        generos: subs,
        fotoPerfilUrl,
        redes: Object.fromEntries(
          Object.entries(redes).filter(([_, v]) => (v as string)?.trim())
        ),
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slug: nombre.trim().toLowerCase().replace(/\s+/g, "-"),
        ownerUid: "admin-seed-uid",
        deleted: false,
      };
      await setDoc(newRef, payload);
      onCreated({ id: newRef.id, ...payload });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "No se pudo crear el artista");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-neutral-900 border /10 p-5 pointer-events-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Nuevo artista (DJ)</h3>
          <button className="text-sm /70 hover:/100" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs /60">Nombre del artista *</label>
            <input
              className="w-full bg-white/5 border /10 rounded px-3 py-2"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Chloe Dubois"
            />
          </div>
          <div>
            <label className="text-xs /60">Foto (opcional)</label>
            <input
              type="file"
              accept="image/*"
              className="w-full bg-white/5 border /10 rounded px-3 py-2"
              onChange={(e) => setFoto(e.target.files?.[0] || null)}
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <div>
              <label className="text-xs /60">Género</label>
              <select
                className="goup-select"
                value={mainGenre}
                onChange={(e) => setMainGenre(e.target.value)}
              >
                <option value="">Selecciona un género</option>
                {genres.map((g) => (
                  <option key={g.id} value={g.main}>
                    {g.main}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs /60">Subgéneros *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[55vh] overflow-y-auto p-2 rounded border /10 bg-white/[0.02]">
                {(mainGenre ? currentSubs : []).map((sg) => {
                  const active = subs.includes(sg);
                  return (
                    <button
                      key={sg}
                      type="button"
                      onClick={() => toggleSub(sg)}
                      className={`text-left px-2 py-2 rounded border /10 w-full text-xs ${
                        active ? "bg-[#FE8B02]/20 border-[#FE8B02]/40" : "bg-white/5"
                      }`}
                    >
                      {sg}
                    </button>
                  );
                })}
                {!mainGenre && (
                  <div className="col-span-3 text-xs /60">
                    Primero selecciona un género para ver sus subgéneros.
                  </div>
                )}
                {mainGenre && currentSubs.length === 0 && (
                  <div className="col-span-3 text-xs /60">
                    Este género no tiene subgéneros cargados.
                  </div>
                )}
              </div>
            </div>

            {subs.length > 0 && (
              <div className="pt-1">
                <div className="text-xs /60 mb-1">Seleccionados:</div>
                <div className="flex flex-wrap gap-2">
                  {subs.map((sg) => (
                    <span
                      key={sg}
                      className="inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-3 py-1 text-xs"
                    >
                      {sg}
                      <button
                        type="button"
                        className="ml-1 rounded-full w-5 h-5 grid place-items-center bg-white/10 hover:bg-white/20"
                        onClick={() => toggleSub(sg)}
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

          <div className="md:col-span-2 grid sm:grid-cols-2 gap-3">
            {(["instagram", "soundcloud", "beatport", "spotify", "website"] as const).map(
              (k) => (
                <div key={k}>
                  <label className="text-xs /60">{k}</label>
                  <input
                    className="w-full bg-white/5 border /10 rounded px-3 py-2"
                    placeholder={`URL ${k}`}
                    value={(redes as any)[k] || ""}
                    onChange={(e) =>
                      setRedes((prev) => ({ ...prev, [k]: e.target.value }))
                    }
                  />
                </div>
              )
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/15"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <LoadingButton loading={saving} onClick={save}>
            Guardar artista
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Página principal -------------------- */
export default function EventPage() {
  return <EventFormSinglePage />;
}

function EventFormSinglePage() {
  const methods = useForm<EventFormValues>({
    resolver,
    defaultValues,
    mode: "onChange",
  });

  const { user } = useAuth();
  const navigate = useNavigate();

  const [sent, setSent] = useState(false);
  const [newVenueOpen, setNewVenueOpen] = useState(false);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeDraft[]>([]);

  const venderTickets = methods.watch("venderTickets");
  const perUserLimit = methods.watch("perUserLimit");

  // Lineup (nuevo): artistas seleccionados
  const [selectedArtists, setSelectedArtists] = useState<
    { id: string; name: string }[]
  >([]);

  // Géneros del evento tomados de musicGenres
  const [allGenres, setAllGenres] = useState<MusicGenre[]>([]);
  const [evMainGenre, setEvMainGenre] = useState<string>("");
  const [evSubs, setEvSubs] = useState<string[]>([]);

  // Mantén sincronizado el campo de formulario "generos" (usado por eventSchema)
  useEffect(() => {
    // aseguramos que zod vea el array actualizado antes de validar
    methods.setValue("generos" as any, evSubs as any, { shouldValidate: true });
  }, [evSubs]);

  // Teléfono con prefijo de país
  const [phoneCountry, setPhoneCountry] = useState<string>("56"); // Chile por defecto
  const [phoneLocal, setPhoneLocal] = useState<string>("");

  // Mantener "telefono" sincronizado dentro del formulario (para el schema zod)
  useEffect(() => {
    const localDigits = String(phoneLocal).replace(/\D/g, "");
    const value = localDigits ? `+${phoneCountry}${localDigits}` : "";
    methods.setValue("telefono" as any, value, { shouldValidate: true, shouldDirty: true });
  }, [phoneCountry, phoneLocal]);

  /* -------- VALIDACIONES cruzadas antes de guardar -------- */
  const validateCross = useMemo(
    () => (data: EventFormValues): { ok: boolean; msg?: string } => {
      const start = combineDateTime(data.fecha, data.horaInicio);
      const end = combineDateTime(data.fechaFin, data.horaCierre);
      if (!start || !end) return { ok: true };
      if (end.getTime() < start.getTime()) {
        return {
          ok: false,
          msg: "La fecha/hora de fin no puede ser anterior al inicio.",
        };
      }
      if (data.ventaAbre || data.ventaCierra) {
        const ventaAbre = data.ventaAbre ? new Date(data.ventaAbre) : null;
        const ventaCierra = data.ventaCierra
          ? new Date(data.ventaCierra)
          : null;
        if (ventaAbre && ventaCierra && ventaCierra.getTime() < ventaAbre.getTime()) {
          return {
            ok: false,
            msg: "La venta cierra no puede ser anterior a la venta abre.",
          };
        }
        if (ventaCierra && start && ventaCierra.getTime() > start.getTime()) {
          return {
            ok: false,
            msg: "La venta debe cerrar antes de que comience el evento.",
          };
        }
      }
      return { ok: true };
    },
    []
  );

  // Efecto para cargar musicGenres desde MUSIC_GENRES
  useEffect(() => {
    const arr: MusicGenre[] = MUSIC_GENRES.map((g) => ({
      id: g.slug,
      main: g.genre,
      subs: g.subgenres,
    }));
    setAllGenres(arr);
  }, []);

  // Memo para obtener subgéneros del género seleccionado
  const currentEventSubs = useMemo(() => {
    const g = allGenres.find((g) => g.main === evMainGenre);
    return g?.subs ?? [];
  }, [allGenres, evMainGenre]);

  // Helper para alternar subgéneros seleccionados
  const toggleEventSub = (sg: string) => {
    setEvSubs((prev) =>
      prev.includes(sg) ? prev.filter((x) => x !== sg) : [...prev, sg]
    );
  };

  /* -------- SUBMIT -------- */
  const onSubmit = methods.handleSubmit(
    async (data) => {
      if (!user?.uid) {
        toast.error("Debes iniciar sesión");
        return;
      }

      const cross = validateCross(data);
      if (!cross.ok) {
        toast.error(cross.msg || "Revisa las fechas del evento y ventas.");
        return;
      }

      // --- Validación y composición del teléfono ---
      const localDigits = String(phoneLocal).replace(/\D/g, "");
      if (localDigits.length < 9) {
        toast.error("El teléfono debe tener al menos 9 números (sin contar el prefijo).");
        return;
      }
      const telefonoE164 = `+${phoneCountry}${localDigits}`;

      try {
        const upload = async (file: File | null, folder: string) => {
          if (!file) return null;
          const storage = getStorage();
          const ext = file.name.split(".").pop() || "jpg";
          const path = `Eventos/${user.uid}/${folder}/${Date.now()}.${ext}`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, file);
          return getDownloadURL(ref);
        };

        const flyerUrl = await upload(data.flyer as File | null, "flyer");
        const imgSecUrl = await upload(data.imgSec as File | null, "imgSec");

        const generosFinal = evSubs; // ahora viene de musicGenres (chips de subgénero)

        const evCol = collection(firebaseDb as Firestore, "evento");
        const evRef = doc(evCol);

        const start = combineDateTime(data.fecha, data.horaInicio);
        const end = combineDateTime(data.fechaFin, data.horaCierre);

        const payload = {
          uid_usersWeb: `/usersWeb/${user.uid}`,
          nombre: data.nombre,
          tipo: data.tipo,
          fechaInicio: start ? start.toISOString() : null,
          fechaFin: end ? end.toISOString() : null,
          clubId: data.clubId,
          capacidad: data.capacidad,
          presupuesto: data.presupuesto,
          promotor: data.promotor,
          telefono: telefonoE164,
          email: data.email,
          descripcion: data.desc,
          generos: generosFinal,
          edad: Number(data.edad ?? 18),
          dress_code: data.dress_code,
          tieneVip: vipToCount(data.tieneVip) > 0,
          cantidadZonasVip: vipToCount(data.tieneVip),
          aceptaReservas: asBool(data.reservas),

          // NUEVO – Lineup
          artistasIds: selectedArtists.map((a) => a.id),
          artistasNombres: selectedArtists.map((a) => a.name),

          flyer: flyerUrl,
          imgSec: imgSecUrl,
          venderTickets: !!data.venderTickets,
          estado: "publicado",
          moneda: "CLP",
          perUserLimit: Math.max(0, Number(data.perUserLimit ?? 0)),
          ventaAbre: data.ventaAbre
            ? new Date(data.ventaAbre).toISOString()
            : null,
          ventaCierra: data.ventaCierra
            ? new Date(data.ventaCierra).toISOString()
            : null,
          createdAt: new Date().toISOString(),
        };

        await setDoc(evRef, payload);

        // 🔔 Disparar notificación sin bloquear el submit
        notifyUsersSafe({
          eventId: evRef.id,
          genres: generosFinal,
          clubId: data.clubId,
        });

        if (data.venderTickets) {
          if (ticketTypes.length === 0) {
            toast.error("Agrega al menos un tipo de ticket o desactiva la venta.");
            return;
          }
          const writes = ticketTypes.map((t, i) =>
            setDoc(
              doc(
                collection(
                  firebaseDb as Firestore,
                  `evento/${evRef.id}/ticketTypes`
                )
              ),
              {
                name: t.name,
                price: Math.max(0, Number(t.price)),
                stockTotal: Math.max(0, Number(t.stockTotal)),
                stockDisponible:
                  typeof t.stockDisponible === "number"
                    ? Math.max(0, Number(t.stockDisponible))
                    : Math.max(0, Number(t.stockTotal)),
                perUserLimit:
                  t.perUserLimit == null
                    ? null
                    : Math.max(0, Number(t.perUserLimit)),
                orden: i + 1,
                activo: !!t.activo,
              }
            )
          );
          await Promise.all(writes);
        }

        toast.success("¡Evento creado con éxito!");
        setSent(true);
        methods.reset(defaultValues);
        setSelectedArtists([]);
        setEvMainGenre("");
        setEvSubs([]);
        setPhoneCountry("56");
        setPhoneLocal("");
        setTimeout(() => navigate("/mis-eventos"), 1200);
      } catch (err: any) {
        console.error("Error creando evento:", err);
        toast.error(err.message || "Error inesperado");
      }
    },
    (errors) => {
      // Mostrar el primer error del resolver (zod)
      const firstKey = Object.keys(errors)[0] as keyof typeof errors | undefined;
      const first = firstKey ? (errors as any)[firstKey] : null;
      const msg =
        (first && (first.message || first?.root?.message)) ||
        "Revisa los campos obligatorios marcados.";
      console.error("Errores del formulario:", errors);
      toast.error(msg);
    }
  );

  /* -------------------- UI -------------------- */
  const fieldCls =
    "w-full bg-white/5  placeholder-white/40 border /10 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FE8B02]";

  return (
    <main className="relative">
      <section className="relative isolate w-full overflow-visible -mb-8">
        {/* Fondo hero: coherente con EventDetail */}
        <div
          className="pointer-events-none absolute -inset-x-40 -top-32 -bottom-56 -z-10 overflow-visible"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#201022] via-[#2b1638] to-black" />
          <div className="absolute inset-0 [background:radial-gradient(1200px_560px_at_64%_32%,rgba(255,255,255,0.08)_0%,rgba(0,0,0,0)_60%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/80" />
        </div>

        {/* Contenido hero */}
        <div className="max-w-6xl mx-auto px-4 pt-12 md:pt-14 pb-12 text-center">
          {/* Título con el mismo estilo del detalle de evento */}
          <h1 className="text-4xl md:text-8xl font-extrabold tracking-tight">
            Crea tu <span className="bg-gradient-to-r from-[#b388ff] to-[#FE8B02] bg-clip-text text-transparent">evento</span>
          </h1>
          <p className="mt-3 text-base md:text-s font-bold text-white/80 max-w-3xl mx-auto">
            Da el siguiente paso : Publica tu evento, define el line‑up y activa la venta de tickets en minutos.
          </p>

          {/* CTA inicial */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-md border border-white/15 bg-black/40 hover:bg-white/10"
            >
              Cancelar
            </button>
            <LoadingButton type="submit" form="create-event-form">
              Crear evento
            </LoadingButton>
          </div>
        </div>
      </section>

      <FormProvider {...methods}>
        <form id="create-event-form" onSubmit={onSubmit} noValidate className="max-w-6xl mx-auto px-4 space-y-8 pb-28">
          <input type="hidden" {...methods.register("telefono" as any)} />
          {/* Información del Evento */}
          <Section title="Información del evento">
            <div className="grid md:grid-cols-2 gap-4 ">
              <RHFInput
                name="nombre"
                label="Nombre del Evento *"
                placeholder="Ej: PURPLE NIGHTS • MIDNIGHT VIBES"
              />
              <RHFSelect
                name="tipo"
                label="Tipo de evento *"
                placeholder="Seleccione una opción"
                options={[
                  "Club",
                  "Festival",
                  "After",
                  "Privado",
                  "Open Air",
                  "Bar",
                  "Otro",
                ]}
              />
            </div>
          </Section>

          {/* Localidad & Tickets */}
          <Section title="Localidad & tickets">
            <div className="space-y-4 relative z-[60]">
              <VenueCombo
                value={methods.watch("clubId")}
                onChange={(id) => {
                  methods.setValue("clubId", String(id), { shouldValidate: true, shouldDirty: true });
                }}
                onNewVenue={() => setNewVenueOpen(true)}
              />

              <div className="rounded-lg border /10 bg-black/30 p-4">
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
                          className={fieldCls}
                          value={Number(perUserLimit || 0)}
                          onChange={(e) =>
                            methods.setValue(
                              "perUserLimit",
                              Math.max(0, Number(e.target.value) || 0),
                              {
                                shouldValidate: true,
                              }
                            )
                          }
                        />
                      </div>
                      <RHFInput name="ventaAbre" type="datetime-local" label="Venta abre" />
                      <RHFInput name="ventaCierra" type="datetime-local" label="Venta cierra" />
                    </div>

                    <div className="rounded-lg border /10 bg-white/[0.02] p-3 md:p-4">
                      <TicketTypesEditor
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

          {/* Artistas (nuevo) */}
          <Section title="Artistas (DJs)">
            <p className="text-sm /70 mb-3">
              Agrega los artistas que tocarán en el evento. Puedes buscarlos por
              subgénero y nombre, o crearlos si no existen.
            </p>
            <ArtistPicker
              selected={selectedArtists}
              setSelected={setSelectedArtists}
            />
          </Section>

          {/* Fecha & Horario */}
          <Section title="Fecha & horario">
            <div className="grid md:grid-cols-4 gap-4">
              <RHFInput name="fecha" type="date" label="Fecha de inicio *" />
              <RHFInput name="horaInicio" type="time" label="Hora de inicio *" />
              <RHFInput name="fechaFin" type="date" label="Fecha de término *" />
              <RHFInput name="horaCierre" type="time" label="Hora de término *" />
            </div>
            <p className="text-xs /50 mt-2">
              Puedes crear eventos de más de un día: selecciona una fecha de
              término posterior.
            </p>
          </Section>

          {/* Capacidad */}
          
          <Section title="Capacidad">
            <RHFSelect
              name="capacidad"
              placeholder="Seleccione cantidad"
              label="Capacidad esperada *"
              options={["0 a 500", "501 a 1000", "1001 a 2000", "Más de 2 000"]}
            />
          </Section>

          {/* Contacto */}
          <Section title="Contacto del organizador">
            <div className="grid md:grid-cols-3 gap-4">
              <RHFInput name="promotor" label="Promotor *" />
              {/* Teléfono con prefijo */}
              <div>
                <label className="text-sm font-medium">Teléfono *</label>
                <div className="flex py-1 items-center gap-2">
                   <select
                    className="w-20 sm:w-24 bg-white/5 border /10 rounded px-2 py-2 h-[42px] text-sm text-center goup-select"
                    value={phoneCountry}
                    onChange={(e) => setPhoneCountry(e.target.value)}
                  >
                    {LATAM_PHONE_OPTIONS.map((opt, idx) => (
                      <option key={`${opt.code}-${idx}`} value={opt.code}>
                        {opt.abbr} (+{opt.code})
                      </option>
                    ))}
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
                    {methods.watch("telefono" as any) || `+${phoneCountry} ${String(phoneLocal).replace(/\D/g, "")}`}
                  </span>
                </p>
              </div>
              <RHFInput name="email" type="email" label="Email *" />
            </div>
          </Section>

          {/* Concepto & Experiencia */}
          <Section title="Concepto & experiencia">
            <RHFTextarea name="desc" label="Descripción *" rows={4} />

            {/* Género del evento desde musicGenres */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Género musical del evento (solo para filtrar subgéneros — lo que se guarda son los subgéneros)</label>
              <div className="grid  gap-3 ">
                <div>
                  <label className="text-xs /60">Género (filtro visual, no se guarda)</label>
                  <select
                    className="goup-select"
                    value={evMainGenre}
                    onChange={(e) => {
                      setEvMainGenre(e.target.value);
                      // Nota: no limpiamos evSubs al cambiar el género principal.
                    }}
                  >
                    <option value="">Selecciona un género</option>
                    {allGenres.map((g) => (
                      <option key={`${g.id}-${g.main}`} value={g.main}>
                        {g.main}
                      </option>
                    ))}
                  </select>
                  <div className="py-1">
                  <label className="text-xs ">Subgéneros (puedes elegir varios) — solo estos se guardan</label>
                  <h2 className="py-1" ></h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 max-h-56 overflow-y-auto p-2 py-1 rounded border /10 bg-white/[0.02]">
                    {(evMainGenre ? currentEventSubs : []).map((sg) => {
                      const active = evSubs.includes(sg);
                      return (
                        <button
                          key={sg}
                          type="button"
                          onClick={() => toggleEventSub(sg)}
                          className={`text-left px-2 py-2 rounded border /10 w-full text-xs ${
                            active ? "bg-[#FE8B02]/20 border-[#FE8B02]/40" : "bg-white/5"
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
                    {evMainGenre && currentEventSubs.length === 0 && (
                      <div className="col-span-2 text-xs /60">
                        Este género no tiene subgéneros cargados.
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
                        className="inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-3 py-1 text-xs"
                      >
                        {sg}
                        <button
                          type="button"
                          className="ml-1 rounded-full w-5 h-5 grid place-items-center bg-white/10 hover:bg-white/20"
                          onClick={() => toggleEventSub(sg)}
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

          {/* Políticas del evento */}
          <Section title="Políticas del evento">
            <div className="grid md:grid-cols-3 gap-4">
              <RHFSelect
                name="edad"
                label="Edad mínima *"
                options={Array.from({ length: 53 }, (_, i) => `${i + 17}`)}
              />
              <RHFSelect
                name="dress_code"
                label="Dress code *"
                options={["Casual", "Formal", "Semi-formal", "Urbano", "Temático"]}
              />
              <RHFSelect name="reservas" label="¿Acepta reservas?" options={["Sí", "No"]} />
            </div>
            <div className="grid md:grid-cols-3 gap-4 mt-4">
              <RHFSelect name="tieneVip" label="¿Zonas VIP?" options={["No", "1", "2", "Más de 5"]} />
              <div className="hidden md:block" />
              <div className="hidden md:block" />
            </div>
          </Section>

          {/* Imágenes */}
          <Section title="Imágenes">
            <div className="grid md:grid-cols-2 text-white gap-4">
              <RHFFile name="flyer" label="Flyer del evento" />
              <RHFFile name="imgSec" label="Imagen secundaria" />
            </div>
          </Section>

          {/* Barra acción – móvil apilado */}
          <div className="sticky bottom-0 z-20 bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-black/40 border-t border-white/10 py-3">
            <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-md border border-white/15 bg-black/40 hover:bg-white/10"
              >
                Cancelar
              </button>
              <LoadingButton type="submit" form="create-event-form" className="w-full sm:w-auto">
                Crear evento
              </LoadingButton>
            </div>
          </div>
        </form>
      </FormProvider>

      <SuccessModal
        open={sent}
        title="¡Evento creado!"
        subtitle="Ya está publicado. La venta se activará según tu configuración."
        onClose={() => setSent(false)}
      />

      {/* Modal nueva localidad */}
      <NewVenueModal
        open={newVenueOpen}
        onClose={() => setNewVenueOpen(false)}
        onCreated={(clubId, nombre) => {
          methods.setValue("clubId", clubId, { shouldValidate: true });
          toast.success(`Localidad creada: ${nombre}`);
        }}
      />
    </main>
  );
}