// src/pages/ClubsBrowse.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ClubList from "@/components/ClubList";

/* =============== Tipos =============== */
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
  servicios?: string[] | null;
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
  servicios: string[];
};

/* =============== Utils =============== */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

export default function ClubsBrowse() {
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [comuna, setComuna] = useState("");
  const [selectedSvcs, setSelectedSvcs] = useState<string[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null); // <- sin distancia por defecto
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  // Panel de filtros (modal/drawer)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const askedGeoRef = useRef(false);

  /* Carga clubes */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap: QuerySnapshot<DocumentData> = await getDocs(collection(db, "club"));
        const list: ClubData[] = snap.docs.map((d) => {
          const c = d.data() as ClubDoc;
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
            servicios: Array.isArray(c?.servicios)
              ? c.servicios.map((s) => `${s}`.trim()).filter(Boolean)
              : [],
          };
        });
        setClubs(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* Geolocalización solo al abrir filtros */
  const requestGeoOnce = () => {
    if (askedGeoRef.current) return;
    askedGeoRef.current = true;
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };
  useEffect(() => {
    if (filtersOpen) requestGeoOnce();
  }, [filtersOpen]);

  /* Opciones dinámicas */
  const cities = useMemo(() => {
    const s = new Set<string>();
    clubs.forEach((c) => c.ciudad && s.add(c.ciudad));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [clubs]);
  const comunas = useMemo(() => {
    const s = new Set<string>();
    clubs.forEach((c) => c.comuna && s.add(c.comuna));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [clubs]);
  const serviceCatalog = useMemo(() => {
    const s = new Set<string>();
    clubs.forEach((c) => c.servicios?.forEach((x) => s.add(x)));
    if (s.size === 0) ["estacionamiento","guardarropía","terraza","accesibilidad","wifi","fumadores"].forEach((x)=>s.add(x));
    return [...s].sort((a,b)=>a.localeCompare(b));
  }, [clubs]);

  /* Filtro principal */
  const filtered = useMemo(() => {
    let list = clubs.slice();

    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter(
        (c) =>
          c.nombre.toLowerCase().includes(qq) ||
          (c.direccion ?? "").toLowerCase().includes(qq)
      );
    }
    if (city.trim()) {
      const v = city.trim().toLowerCase();
      list = list.filter((c) => (c.ciudad ?? "").toLowerCase().includes(v));
    }
    if (comuna.trim()) {
      const v = comuna.trim().toLowerCase();
      list = list.filter((c) => (c.comuna ?? "").toLowerCase().includes(v));
    }
    if (selectedSvcs.length > 0) {
      list = list.filter((c) => selectedSvcs.every((s) => c.servicios?.includes(s)));
    }
    if (myPos && distanceKm != null) {
      list = list.filter((c) => {
        if (c.lat == null || c.lng == null) return false;
        const d = haversineKm(myPos, { lat: c.lat, lng: c.lng });
        return d <= distanceKm;
      });
    }

    list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return list;
  }, [clubs, q, city, comuna, selectedSvcs, myPos, distanceKm]);

  const clearFilters = () => {
    setQ("");
    setCity("");
    setComuna("");
    setSelectedSvcs([]);
    setDistanceKm(null); // <- vuelve a mostrar todo
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      {/* Cabecera */}
      <header className="text-center mb-6">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#b688ff]">Explora los Clubes</h1>
        <p className="text-foreground/70 mt-2">Encuentra el lugar perfecto para tu próxima noche.</p>
      </header>

      {/* Buscador + botón Filtrar */}
      <div className="flex items-center gap-3 mb-6">
        <input
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#8e2afc]"
          placeholder="Buscar por nombre o dirección…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          onClick={() => setFiltersOpen(true)}
          className="px-3 py-2 rounded-lg bg-primary/20 text-foreground hover:bg-primary/30 border border-white/10"
        >
          Filtrar
        </button>
      </div>

      {/* Resultados (siempre a ancho completo) */}
      {loading ? (
        <p className="text-foreground/70">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-foreground/70">No encontramos clubes con esos filtros.</p>
      ) : (
        <ClubList clubs={filtered} />
      )}

      {/* Drawer de Filtros (móvil + escritorio) */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFiltersOpen(false)} />
          <aside
            className="
              absolute right-0 top-0 h-full w-full max-w-md
              bg-card/95 backdrop-blur-md border-l border-border/60
              p-4 overflow-y-auto
            "
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Filtrar</h3>
              <button onClick={() => setFiltersOpen(false)} className="text-foreground/70">✕</button>
            </div>

            {/* Localidad */}
            <div className="space-y-2 mb-4">
              <p className="text-sm text-foreground/70">Localidad</p>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">Ciudad (todas)</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5"
                value={comuna}
                onChange={(e) => setComuna(e.target.value)}
              >
                <option value="">Comuna (todas)</option>
                {comunas.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Servicios (AND) */}
            <div className="space-y-2 mb-4">
              <p className="text-sm text-foreground/70">Servicios (debe incluir todos)</p>
              <div className="flex flex-wrap gap-2">
                {serviceCatalog.map((s) => {
                  const active = selectedSvcs.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setSelectedSvcs((cur) =>
                          active ? cur.filter((x) => x !== s) : [...cur, s]
                        )
                      }
                      className={`px-2 py-1 rounded-full text-xs border transition ${
                        active
                          ? "bg-[#8e2afc]/30 border-[#8e2afc]/50 text-[#e7dcff]"
                          : "bg-white/5 border-white/10 text-foreground/80 hover:bg-white/10"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Distancia */}
            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground/70">Distancia (km)</p>
                <button className="text-xs underline" onClick={requestGeoOnce}>
                  Usar mi ubicación
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={distanceKm ?? 10}
                  onChange={(e) => setDistanceKm(Number(e.target.value))}
                />
                <span className="text-sm">{distanceKm ?? 10} km</span>
                <button className="text-xs text-foreground/70 underline ml-2" onClick={() => setDistanceKm(null)}>
                  sin distancia
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 border border-white/10"
                onClick={() => setFiltersOpen(false)}
              >
                Aplicar
              </button>
              <button
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10"
                onClick={clearFilters}
              >
                Limpiar
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}