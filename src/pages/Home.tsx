// src/pages/Home.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";
import ClubList from "@/components/ClubList";
import DistanceSlider from "@/components/DistanceSlider";
import { getDistanceFromLatLonInKm } from "@/lib/utils";
import { MAIN_GENRES, getSubgenres } from "@/lib/musicGenres";

/* ===== Tipos ===== */
type ClubDoc = {
  nombre: string;
  img_portada?: string | null;
  imagen?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  comuna?: string | null;
  pais?: string | null;
  latitud?: number | null;
  longitud?: number | null;

  // Puede existir un array antiguo
  servicios?: string[] | null;

  // Campos booleanos reales en tu colección
  accesibilidad?: boolean;
  estacionamientos?: boolean;
  guardaropia?: boolean; // en DB está sin tilde
  terraza?: boolean;
  fumadores?: boolean;
  wifi?: boolean;
  seguridad?: boolean;
  vips?: boolean;

  // NUEVO: géneros y subgéneros (nombres posibles)
  generos?: string[] | null;
  subGeneros?: string[] | null;   // camelCase
  sub_generos?: string[] | null;  // underscore (variante 1)
  generos_sub?: string[] | null;  // underscore (variante 2, orden invertido)
};

type ClubData = {
  id: string;
  nombre: string;
  cover?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  comuna?: string | null;
  pais?: string | null;
  lat?: number | null;
  lng?: number | null;

  // Derivados siempre presentes
  servicios: string[];
  serviciosNorm: string[];

  // NUEVO: géneros normalizados (principal + sub)
  generosAll: string[];
};

/* ===== Cache (stale-while-revalidate) ===== */
const HAS_WINDOW = typeof window !== "undefined";
const CLUB_CACHE_KEY = "goup:clubs:v1";
const CLUB_HASH_KEY = "goup:clubs:hash:v1";

type ClubCachePayload = {
  ts: number;
  clubs: ClubData[];
  hashes: Record<string, string>;
};

function safeLocalGet<T>(key: string): T | null {
  if (!HAS_WINDOW) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function safeLocalSet<T>(key: string, val: T) {
  if (!HAS_WINDOW) return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}
function hashString(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/* ===== Utils ===== */
function norm(v?: string | null) {
  return (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Expande un género principal a [principal + todos sus subgéneros] y normaliza
function expandMainToAll(main: string): string[] {
  const subs = getSubgenres(main) ?? [];
  return [main, ...subs].map((g) => norm(g));
}
function clubToHashable(c: ClubData) {
  return {
    id: c.id,
    nombre: c.nombre ?? "",
    cover: c.cover ?? null,
    direccion: c.direccion ?? null,
    ciudad: c.ciudad ?? null,
    comuna: c.comuna ?? null,
    pais: c.pais ?? null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    servicios: [...(c.servicios ?? [])].map(norm).sort(),
    generosAll: [...(c.generosAll ?? [])].map(norm).sort(), // NUEVO
  };
}
function computeHashes(list: ClubData[]) {
  const map: Record<string, string> = {};
  for (const c of list) map[c.id] = hashString(JSON.stringify(clubToHashable(c)));
  return map;
}
function haveClubsChanged(a: Record<string, string> | null, b: Record<string, string>) {
  if (!a) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return true;
  for (const id of bKeys) if (a[id] !== b[id]) return true;
  return false;
}
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return getDistanceFromLatLonInKm(a.lat, a.lng, b.lat, b.lng);
}

/* Resalta el término buscado */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return <>{text}</>;
  const before = text.slice(0, i);
  const match = text.slice(i, i + q.length);
  const after = text.slice(i + q.length);
  return (
    <>
      {before}
      <mark className="bg-primary/30 text-foreground rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

/* ===== Mapeo de booleanos -> etiquetas visibles ===== */
const SERVICE_BOOL_TO_LABEL: Record<string, string> = {
  accesibilidad: "accesibilidad",
  estacionamientos: "estacionamientos",
  guardaropia: "guardarropía", // mostramos con tilde
  terraza: "terraza",
  fumadores: "fumadores",
  wifi: "wifi",
  seguridad: "seguridad",
  vips: "vips",
};

/* Catálogo por defecto para que los chips SIEMPRE aparezcan */
const DEFAULT_SERVICES = [
  "accesibilidad",
  "estacionamientos",
  "guardarropía",
  "terraza",
  "wifi",
  "fumadores",
  "seguridad",
  "vips",
];



export default function Home() {
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [q, setQ] = useState("");
  const [selectedSvcs, setSelectedSvcs] = useState<string[]>([]);
  // NUEVO: filtro por géneros principales
  const [selectedMainGenres, setSelectedMainGenres] = useState<string[]>([]);

  // Distancia
  const [distanceKm, setDistanceKm] = useState<number>(20);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  // Autocomplete
  const [showSug, setShowSug] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  /* 1) Pintar cache */
  useEffect(() => {
    const cached = safeLocalGet<ClubCachePayload>(CLUB_CACHE_KEY);
    if (cached?.clubs?.length) {
      setClubs(cached.clubs);
      setLoading(false);
    }
  }, []);

  /* 2) Revalidar contra Firestore */
  useEffect(() => {
    (async () => {
      try {
        const snap: QuerySnapshot<DocumentData> = await getDocs(collection(firebaseDb, "club"));
        const list: ClubData[] = snap.docs.map((d) => {
          const c = d.data() as ClubDoc;

          // 2.1) Empezamos con el array antiguo si existe
          const fromArray = Array.isArray(c?.servicios)
            ? c.servicios.map((s) => `${s}`.trim()).filter(Boolean)
            : [];

          // 2.2) Agregamos etiquetas a partir de booleanos
          const fromBools: string[] = [];
          (Object.keys(SERVICE_BOOL_TO_LABEL) as Array<keyof typeof SERVICE_BOOL_TO_LABEL>).forEach((key) => {
            const val = (c as any)[key];
            if (val === true) fromBools.push(SERVICE_BOOL_TO_LABEL[key]);
          });

          const servicios = Array.from(new Set<string>([...fromArray, ...fromBools]));
          const serviciosNorm = servicios.map(norm);

          // ===== Géneros: principal + sub (acepta nombres alternos) =====
          const genRaw = Array.isArray(c?.generos) ? c.generos : [];
          const subRaw =
            Array.isArray(c?.subGeneros) ? c.subGeneros :
            Array.isArray((c as any)?.sub_generos) ? (c as any).sub_generos :
            Array.isArray((c as any)?.generos_sub) ? (c as any).generos_sub :
            [];
          const generosAll = Array.from(
            new Set<string>([...genRaw, ...subRaw].map((g) => norm(`${g}`)))
          ).filter(Boolean);

          return {
            id: d.id,
            nombre: c?.nombre ?? "Club",
            cover: c?.img_portada ?? c?.imagen ?? null,
            direccion: c?.direccion ?? null,
            ciudad: c?.ciudad ?? null,
            comuna: c?.comuna ?? null,
            pais: c?.pais ?? null,
            lat: typeof c?.latitud === "number" ? c.latitud : null,
            lng: typeof c?.longitud === "number" ? c.longitud : null,
            servicios,
            serviciosNorm,
            generosAll,
          };
        });

        list.sort((a, b) => a.nombre.localeCompare(b.nombre));

        const newHashes = computeHashes(list);
        const cachedHashes = safeLocalGet<Record<string, string>>(CLUB_HASH_KEY);
        if (haveClubsChanged(cachedHashes, newHashes)) {
          setClubs(list);
          safeLocalSet<ClubCachePayload>(CLUB_CACHE_KEY, { ts: Date.now(), clubs: list, hashes: newHashes });
          safeLocalSet<Record<string, string>>(CLUB_HASH_KEY, newHashes);
        }
        setLoading(false);
      } catch {
        setLoading((prev) => prev && true);
      }
    })();
  }, []);

  /* Geo para slider */
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setMyPos(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  /* Cerrar sugerencias al hacer clic fuera */
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node) && e.target !== inputRef.current) {
        setShowSug(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  /* Catálogo de chips: datos reales + defaults (garantiza que siempre se vean) */
  const serviceCatalog = useMemo(() => {
    const s = new Set<string>(DEFAULT_SERVICES);
    clubs.forEach((c) => c.servicios?.forEach((x) => x && s.add(x)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [clubs]);

  /* Sugerencias (autocompletar) */
  type Suggestion = { id: string; label: string; sub?: string };
  const suggestions: Suggestion[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const scored: Array<{ score: number; s: Suggestion }> = [];
    for (const c of clubs) {
      const name = c.nombre ?? "";
      const addr = c.direccion ?? "";
      const loc = [c.comuna, c.ciudad].filter(Boolean).join(", ");
      const nameL = name.toLowerCase();
      const addrL = addr.toLowerCase();
      const locL = loc.toLowerCase();
      if (nameL.includes(term) || addrL.includes(term) || locL.includes(term)) {
        let score = 0;
        if (nameL.startsWith(term)) score += 3;
        else if (nameL.includes(term)) score += 2;
        if (addrL.startsWith(term) || locL.startsWith(term)) score += 1;
        scored.push({ score, s: { id: c.id, label: name, sub: addr || loc || "" } });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.s.label.localeCompare(b.s.label));
    const seen = new Set<string>();
    const arr: Suggestion[] = [];
    for (const { s } of scored) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      arr.push(s);
      if (arr.length >= 8) break;
    }
    return arr;
  }, [q, clubs]);

  /* Filtrado + distancia */
  const filtered = useMemo(() => {
    let list = clubs.slice();

    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter(
        (c) =>
          c.nombre.toLowerCase().includes(qq) ||
          (c.direccion ?? "").toLowerCase().includes(qq) ||
          (c.ciudad ?? "").toLowerCase().includes(qq) ||
          (c.comuna ?? "").toLowerCase().includes(qq)
      );
    }

    // NUEVO: filtro por géneros principales (incluye subgéneros)
    if (selectedMainGenres.length > 0) {
      const allowed = new Set<string>();
      selectedMainGenres.forEach((g) => expandMainToAll(g).forEach((x) => allowed.add(x)));
      list = list.filter((c) => (c.generosAll ?? []).some((g) => allowed.has(norm(g))));
    }

    if (selectedSvcs.length > 0) {
      const required = selectedSvcs.map(norm);
      list = list.filter((c) => required.every((r) => (c.serviciosNorm ?? []).includes(r)));
    }

    if (myPos) {
      list = list.filter((c) => {
        if (c.lat == null || c.lng == null) return false;
        const d = haversineKm(myPos, { lat: c.lat, lng: c.lng });
        return d <= distanceKm;
      });
    }

    list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return list;
  }, [clubs, q, selectedMainGenres, selectedSvcs, myPos, distanceKm]);

  const clearFilters = () => {
    setQ("");
    setSelectedMainGenres([]);
    setSelectedSvcs([]);
  };

  // Handlers Autocomplete
  const onKeyDownSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSug && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setShowSug(true);
      setActiveIdx(0);
      return;
    }
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      if (activeIdx >= 0 && activeIdx < suggestions.length) {
        const s = suggestions[activeIdx];
        setQ(s.label);
        setShowSug(false);
        setActiveIdx(-1);
      }
    } else if (e.key === "Escape") {
      setShowSug(false);
      setActiveIdx(-1);
    }
  };

  const anyFilterActive = !!q.trim() || selectedMainGenres.length > 0 || selectedSvcs.length > 0 || !!myPos;

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <header className="text-center mb-6">
      <h1 className="text-4xl md:text-8xl font-extrabold tracking-tight">
           Explora <span className="bg-gradient-to-r from-[#FE8B02] to-[#FF3403] bg-clip-text text-transparent">Clubes</span>
          </h1>
        <p className="text-foreground/70 mt-2">Encuentra el lugar perfecto para tu próxima noche.</p>
      </header>

      {/* Buscador */}
      <div className="flex items-start gap-3 mb-2 relative" ref={boxRef}>
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#FE8B02]"
            placeholder="Buscar por nombre, dirección, ciudad o comuna…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShowSug(!!e.target.value.trim());
              setActiveIdx(-1);
            }}
            onFocus={() => setShowSug(!!q.trim())}
            onKeyDown={onKeyDownSearch}
            aria-autocomplete="list"
            aria-expanded={showSug}
            aria-controls="home-suggest-list"
          />

          {/* Dropdown de sugerencias */}
          {showSug && suggestions.length > 0 && (
            <ul
              id="home-suggest-list"
              className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-white/10 bg-card/95 backdrop-blur-md shadow-lg"
              role="listbox"
            >
              {suggestions.map((s, idx) => (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={idx === activeIdx}
                  className={`px-3 py-2 cursor-pointer text-sm ${
                    idx === activeIdx ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQ(s.label);
                    setShowSug(false);
                    setActiveIdx(-1);
                  }}
                >
                  <div className="truncate">
                    <Highlight text={s.label} query={q} />
                  </div>
                  {s.sub ? (
                    <div className="text-xs text-foreground/70 truncate">
                      <Highlight text={s.sub} query={q} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Filtro por Géneros (principales) */}
      <div className="mb-3 -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
          {MAIN_GENRES.map((g) => {
            const active = selectedMainGenres.includes(g);
            return (
              <button
                key={g}
                onClick={() =>
                  setSelectedMainGenres((cur) =>
                    active ? cur.filter((x) => x !== g) : [...cur, g]
                  )
                }
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs border transition ${
                  active
                    ? "bg-[#FE8B02]/30 border-[#FE8B02]/60 text-[#e7dcff]"
                    : "bg-white/5 border-white/10 text-foreground/80 hover:bg-white/10"
                }`}
                aria-pressed={active}
                title={`Filtrar por ${g} (incluye subgéneros)`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chips de servicios (fijos) */}
      <div className="mb-4 -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
          {serviceCatalog.map((s) => {
            const active = selectedSvcs.includes(s);
            return (
              <button
                key={s}
                onClick={() =>
                  setSelectedSvcs((cur) => (active ? cur.filter((x) => x !== s) : [...cur, s]))
                }
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs border transition ${
                  active
                    ? "bg-[#FE8B02]/30 border-[#FE8B02]/60 text-[#e7dcff]"
                    : "bg-white/5 border-white/10 text-foreground/80 hover:bg-white/10"
                }`}
                aria-pressed={active}
              >
                {s}
              </button>
            );
          })}

          {anyFilterActive && (
            <button
              onClick={clearFilters}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs border border-white/15 bg-white/5 hover:bg-white/10"
              title="Limpiar filtros"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Slider de distancia */}
      <div className="mb-6">
        <DistanceSlider value={distanceKm} setValue={setDistanceKm} />
      </div>

      {/* Resultados */}
      {loading ? (
        <p className="text-foreground/70">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-foreground/70">No encontramos clubes con esos filtros.</p>
      ) : (
        <ClubList clubs={filtered} />
      )}
    </main>
  );
}