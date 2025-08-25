// src/pages/EventsBrowse.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, doc, getDoc, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useNavigate } from "react-router-dom";
import DistanceSlider from "@/components/DistanceSlider";
import toast from "react-hot-toast";

/* ================== Tipos ================== */
type EventDoc = {
  nombre: string;
  flyer?: string | null;
  fechaInicio?: string | null; // ISO
  fechaFin?: string | null; // ISO
  generos?: string[] | null;
  clubId?: string | null;
  precioDesde?: number | null;
  precioHasta?: number | null;
};
type ClubDoc = {
  nombre: string;
  ciudad?: string | null;
  comuna?: string | null;
  direccion?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  img_portada?: string | null;
};
type EventData = {
  id: string;
  nombre: string;
  flyer?: string | null;
  generos: string[];        // SIEMPRE array
  generosNorm: string[];    // normalizados para filtrar
  start: number | null;
  end: number | null;
  clubId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
};
type ClubLite = {
  id: string;
  nombre: string;
  ciudad?: string | null;
  comuna?: string | null;
  direccion?: string | null;
  lat?: number | null;
  lng?: number | null;
  cover?: string | null;
};
type ClubMap = Record<string, ClubLite>;

/* ================== Utils ================== */
const toTs = (iso?: string | null) => (iso ? new Date(iso).getTime() : null);

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

const norm = (v?: string | null) =>
  (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/* Catálogo base para que los chips SIEMPRE se muestren */
const GENRES_DEFAULT = [
  "Reguetón",
  "Techno",
  "House",
  "Pop",
  "Salsa",
  "Hardstyle",
  "Trance",
  "Hip-Hop",
  "Urbano",
  "Guaracha",
];

/* ================== Botones/Icons reutilizables ================== */
function IconBtn({
  title,
  onClick,
  children,
  className = "",
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`inline-flex w-9 h-9 items-center justify-center rounded-full border border-white/15 bg-black/60 hover:bg-black/75 text-white shadow transition ${className}`}
    >
      {children}
    </button>
  );
}
const Heart = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41.99 4.22 2.48C11.53 4.99 13.2 4 14.94 4 17.44 4 19.5 6 19.5 8.5c0 3.78-3.4 6.86-8.05 11.54L12 21.35z" />
  </svg>
);
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M18 16.1a3 3 0 0 0-2.4 1.2l-7-4a3 3 0 0 0 0-2.6l7-4A3 3 0 1 0 16 5a3 3 0 0 0 .2 1l-7 4a3 3 0 1 0 0 4l7 4a3 3 0 1 0 1.8-1.9z" />
  </svg>
);

/* ================== Favoritos y compartir ================== */
function useFavEvent(eventId: string, eventName: string) {
  const key = `fav:event:${eventId}`;
  const [fav, setFav] = useState(false);
  useEffect(() => {
    setFav(localStorage.getItem(key) === "1");
  }, [key]);
  const toggle = () => {
    const next = !fav;
    setFav(next);
    localStorage.setItem(key, next ? "1" : "0");
    if (next) toast.success(`Agregado a favoritos: ${eventName}`);
    else toast(`Quitado de favoritos`, { icon: "💔" });
  };
  return { fav, toggle };
}

async function shareEvent(title: string, path: string, extra?: string) {
  const url = path.startsWith("http") ? path : `${location.origin}${path}`;
  const text = [title, extra].filter(Boolean).join(" · ");
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    }
  } catch {
    /* cancelado */
  }
}

/* ================== Cards ================== */
function EventCardMobile({
  e,
  cl,
  whenShort,
  onOpen,
}: {
  e: EventData;
  cl: ClubLite | null;
  whenShort: (ts: number | null) => string;
  onOpen: () => void;
}) {
  const flyer = e.flyer || "https://placehold.co/640x640/101013/FFF?text=Evento";
  const shareHref = `/mis-eventos/${e.id}`;
  const { fav, toggle } = useFavEvent(e.id, e.nombre);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onOpen()}
      className="group w-full rounded-2xl text-left bg-card/90 border border-border/60 hover:ring-1 hover:ring-primary/40 transition shadow-[0_6px_18px_-8px_rgba(0,0,0,.45)] px-3 py-3 flex items-center gap-3"
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
        <img src={flyer} alt={e.nombre} className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-foreground truncate">{e.nombre}</p>
        <p className="text-[11px] text-foreground/70 truncate">
          {whenShort(e.start)} {cl ? `· ${cl.nombre}` : ""}
        </p>
        {e.generos?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {e.generos.slice(0, 3).map((g) => (
              <span key={g} className="px-1.5 py-0.5 rounded-full text-[10px] leading-none bg-muted text-muted-foreground border border-border">
                {g}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2 pl-2">
        <IconBtn title={fav ? "Quitar de favoritos" : "Agregar a favoritos"} onClick={toggle}>
          <Heart />
        </IconBtn>
        <IconBtn
          title="Compartir"
          onClick={() =>
            shareEvent(e.nombre, shareHref, cl ? `${whenShort(e.start)} · ${cl.nombre}` : whenShort(e.start))
          }
        >
          <ShareIcon />
        </IconBtn>
      </div>
    </div>
  );
}

function EventCardDesktop({
  e,
  cl,
  whenLong,
  whenShort,
  onOpen,
}: {
  e: EventData;
  cl: ClubLite | null;
  whenLong: (ts: number | null) => string;
  whenShort: (ts: number | null) => string;
  onOpen: () => void;
}) {
  const flyer = e.flyer || "https://placehold.co/800x800/101013/FFF?text=Evento";
  const shareHref = `/mis-eventos/${e.id}`;
  const { fav, toggle } = useFavEvent(e.id, e.nombre);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onOpen()}
      className="relative group rounded-2xl select-none text-left outline-none focus:ring-2 focus:ring-primary/40"
      aria-label={`Abrir ${e.nombre}`}
    >
      <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-black/40 mix-blend-screen opacity-60 group-hover:opacity-35 transition-opacity" />
      <div
        className="relative rounded-2xl overflow-hidden bg-card ring-1 ring-border hover:ring-primary/60 shadow-[0_0_0_0_rgba(142,42,252,0)] hover:shadow-[0_18px_42px_-10px_rgba(142,42,252,0.35)] transform-gpu transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.02]"
      >
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          <IconBtn title={fav ? "Quitar de favoritos" : "Agregar a favoritos"} onClick={toggle}>
            <Heart />
          </IconBtn>
          <IconBtn
            title="Compartir"
            onClick={() =>
              shareEvent(e.nombre, shareHref, cl ? `${whenShort(e.start)} · ${cl.nombre}` : whenShort(e.start))
            }
          >
            <ShareIcon />
          </IconBtn>
        </div>

        <div className="relative w-full pt-[100%]">
          <img
            src={flyer}
            alt={e.nombre}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
          />
        </div>

        <div className="p-3">
          <p className="font-semibold text-sm text-foreground truncate">{e.nombre}</p>
          <p className="text-xs text-foreground/70 truncate">
            {whenLong(e.start)} {cl ? ` · ${cl.nombre}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================== Página ================== */
export default function EventsBrowse() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [clubs, setClubs] = useState<ClubMap>({});
  const [loading, setLoading] = useState(true);

  // Filtros
  const [q, setQ] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [comuna, setComuna] = useState("");
  const [priceMin, setPriceMin] = useState<number | "">("");
  const [priceMax, setPriceMax] = useState<number | "">("");
  const [showPast, setShowPast] = useState(false);

  // Distancia visible
  const [distanceKm, setDistanceKm] = useState<number>(20);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  const navigate = useNavigate();

  // Carga base
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap: QuerySnapshot<DocumentData> = await getDocs(collection(db, "evento"));
        const evs: EventData[] = snap.docs.map((d) => {
          const e = d.data() as EventDoc;
          const generos = Array.isArray(e?.generos) ? e.generos.filter(Boolean) as string[] : [];
          const generosNorm = generos.map(norm);
          return {
            id: d.id,
            nombre: e?.nombre ?? "Evento",
            flyer: e?.flyer ?? null,
            generos,
            generosNorm,
            start: toTs(e?.fechaInicio),
            end: toTs(e?.fechaFin),
            clubId: e?.clubId ?? null,
            minPrice: typeof e?.precioDesde === "number" ? e.precioDesde! : null,
            maxPrice: typeof e?.precioHasta === "number" ? e.precioHasta! : null,
          };
        });

        // Clubs únicos
        const clubIds = [...new Set(evs.map((e) => e.clubId).filter(Boolean) as string[])];
        const fetched = await Promise.all(
          clubIds.map(async (cid) => {
            try {
              const s = await getDoc(doc(db, "club", cid));
              if (!s.exists()) return null;
              const c = s.data() as ClubDoc;
              return {
                id: cid,
                nombre: c?.nombre ?? "Club",
                ciudad: c?.ciudad ?? null,
                comuna: c?.comuna ?? null,
                direccion: c?.direccion ?? null,
                lat: typeof c?.latitud === "number" ? c.latitud : null,
                lng: typeof c?.longitud === "number" ? c.longitud : null,
                cover: c?.img_portada ?? null,
              } as ClubLite;
            } catch {
              return null;
            }
          })
        );

        const map: ClubMap = {};
        fetched.forEach((c) => {
          if (c) map[c.id] = c;
        });

        setEvents(evs);
        setClubs(map);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Geolocalización para el slider
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setMyPos(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Catálogo de géneros: unión (DB + defaults)
  const genresCatalog = useMemo(() => {
    const set = new Set<string>(GENRES_DEFAULT);
    events.forEach((e) => e.generos?.forEach((g) => g && set.add(g)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [events]);

  // Derivados selects localidad
  const cities = useMemo(() => {
    const set = new Set<string>();
    Object.values(clubs).forEach((c) => c.ciudad && set.add(c.ciudad));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [clubs]);

  const comunas = useMemo(() => {
    const set = new Set<string>();
    Object.values(clubs).forEach((c) => c.comuna && set.add(c.comuna));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [clubs]);

  // Filtro principal
  const now = Date.now();
  const filtered = useMemo(() => {
    let list = events.slice();

    // Próximos / Pasados
    list = list.filter((e) => {
      const end = e.end ?? e.start ?? 0;
      const isPast = end < now;
      return showPast ? isPast : !isPast;
    });

    // Texto (evento o club)
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((e) => {
        const inName = e.nombre.toLowerCase().includes(qq);
        const inClub = e.clubId && clubs[e.clubId]?.nombre?.toLowerCase().includes(qq);
        return inName || inClub;
      });
    }

    // Géneros (AND) con normalización
    if (selectedGenres.length > 0) {
      const required = selectedGenres.map(norm);
      list = list.filter((e) => required.every((g) => (e.generosNorm ?? []).includes(g)));
    }

    // Localidad
    if (city.trim()) {
      const c = city.trim().toLowerCase();
      list = list.filter((e) => {
        const cl = e.clubId ? clubs[e.clubId] : null;
        return !!cl && (cl.ciudad ?? "").toLowerCase().includes(c);
      });
    }
    if (comuna.trim()) {
      const cc = comuna.trim().toLowerCase();
      list = list.filter((e) => {
        const cl = e.clubId ? clubs[e.clubId] : null;
        return !!cl && (cl.comuna ?? "").toLowerCase().includes(cc);
      });
    }

    // Distancia
    if (myPos) {
      list = list.filter((e) => {
        const cl = e.clubId ? clubs[e.clubId] : null;
        if (!cl || cl.lat == null || cl.lng == null) return false;
        const d = haversineKm(myPos, { lat: cl.lat!, lng: cl.lng! });
        return d <= distanceKm;
      });
    }

    // Precio
    const min = typeof priceMin === "number" ? priceMin : null;
    const max = typeof priceMax === "number" ? priceMax : null;
    if (min != null || max != null) {
      list = list.filter((e) => {
        const p = e.minPrice ?? e.maxPrice;
        if (p == null) return false;
        if (min != null && p < min) return false;
        if (max != null && p > max) return false;
        return true;
      });
    }

    // Orden cronológico
    list.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
    return list;
  }, [events, clubs, q, selectedGenres, city, comuna, myPos, distanceKm, priceMin, priceMax, showPast, now]);

  const whenLong = (ts: number | null) =>
    ts != null
      ? new Date(ts).toLocaleDateString("es-CL", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
      : "Próximamente";

  const whenShort = (ts: number | null) =>
    ts != null ? new Date(ts).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "Pronto";

  const clearFilters = () => {
    setSelectedGenres([]);
    setCity("");
    setComuna("");
    setPriceMin("");
    setPriceMax("");
    setShowPast(false);
  };

  const anyFilterActive =
    !!q.trim() ||
    selectedGenres.length > 0 ||
    !!city.trim() ||
    !!comuna.trim() ||
    typeof priceMin === "number" ||
    typeof priceMax === "number" ||
    showPast ||
    !!myPos;

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#b688ff]">Próximos Eventos</h1>
        <p className="text-foreground/70 mt-2">No te pierdas las mejores fiestas y eventos en tu ciudad.</p>
      </header>

      {/* Buscador (sin drawer) */}
      <div className="flex items-start gap-3 mb-2">
        <input
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#8e2afc]"
          placeholder="Buscar por nombre…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Chips de GÉNEROS (fijos) */}
      <div className="mb-3 -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
          {genresCatalog.map((g) => {
            const active = selectedGenres.includes(g);
            return (
              <button
                key={g}
                onClick={() => setSelectedGenres((cur) => (active ? cur.filter((x) => x !== g) : [...cur, g]))}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs border transition ${
                  active
                    ? "bg-[#8e2afc]/30 border-[#8e2afc]/60 text-[#e7dcff]"
                    : "bg-white/5 border-white/10 text-foreground/80 hover:bg-white/10"
                }`}
                aria-pressed={active}
              >
                {g}
              </button>
            );
          })}

          {anyFilterActive && (
            <button
              onClick={clearFilters}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs border border-white/15 bg-white/5 hover:bg-white/10"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Línea de filtros rápidos: ciudad/comuna, precio y “realizados” */}
    
        <div className="grid grid-cols-2 gap-2">
        
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          Mostrar Eventos realizados
        </label>
      </div>

      {/* DistanceSlider visible */}
      <div className="mb-6">
        <DistanceSlider value={distanceKm} setValue={setDistanceKm} />
      </div>

      {/* Resultados */}
      {loading ? (
        <p className="text-foreground/70">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-foreground/70">No encontramos eventos con esos filtros.</p>
      ) : (
        <>
          {/* Mobile list */}
          <div className="sm:hidden px-1 space-y-3 mb-8">
            {filtered.map((e) => (
              <EventCardMobile
                key={e.id}
                e={e}
                cl={e.clubId ? clubs[e.clubId] : null}
                whenShort={whenShort}
                onOpen={() => navigate(`/mis-eventos/${e.id}`)}
              />
            ))}
          </div>

          {/* Desktop grid */}
          <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map((e) => (
              <EventCardDesktop
                key={e.id}
                e={e}
                cl={e.clubId ? clubs[e.clubId] : null}
                whenLong={whenLong}
                whenShort={whenShort}
                onOpen={() => navigate(`/mis-eventos/${e.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}