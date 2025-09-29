// src/pages/ArtistsBrowse.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";
import ArtistCard, { ArtistLite } from "@/components/ArtistCard";
import ArtistList from "@/components/ArtistList";


/* ===================== Tipos ===================== */
type ArtistDoc = {
  slug: string;
  nombre_artistico: string;
  fotoPerfilUrl?: string | null;
  generos?: string[] | null;
};

/* ===================== Caché de imágenes ===================== */
const IMG_CACHE = "goup-artist-img-v1";
const INDEX_KEY = "artistImgCacheIndex";
const MAX_CACHE_ITEMS = 150;

const hasCaches = typeof window !== "undefined" && "caches" in window;

// LRU index helpers
const getIndex = (): string[] => {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};
const saveIndex = (arr: string[]) => {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
};

async function touchIndex(url: string) {
  if (!hasCaches) return;
  const cache = await caches.open(IMG_CACHE);
  const idx = getIndex();
  const pos = idx.indexOf(url);
  if (pos >= 0) idx.splice(pos, 1);
  idx.unshift(url);

  while (idx.length > MAX_CACHE_ITEMS) {
    const drop = idx.pop();
    if (drop) {
      try { await cache.delete(drop); } catch {}
    }
  }
  saveIndex(idx);
}

/**
 * Devuelve una URL lista para <img>:
 * - Si hay respuesta cacheada legible: genera y devuelve un objectURL (blob:...)
 * - Si no hay, intenta fetchear, cachear y devolver blob:...
 * - Si la respuesta es opaque o hay error: devuelve la URL original
 */
async function cacheImageToDisplayUrl(url: string): Promise<string> {
  if (!hasCaches || !url) return url;

  try {
    const cache = await caches.open(IMG_CACHE);

    // ¿ya en caché?
    let resp = await cache.match(url, { ignoreVary: true, ignoreSearch: false });

    // si no, traer de red y guardar
    if (!resp) {
      try {
        const net = await fetch(url, { mode: "cors", credentials: "omit", cache: "default" });
        if (net.ok || net.type === "opaque") {
          resp = net.clone();
          await cache.put(url, net.clone());
          await touchIndex(url);
        } else {
          return url;
        }
      } catch {
        return url;
      }
    }

    // intentar blob()
    try {
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      return objectUrl;
    } catch {
      return url; // opaque sin acceso al cuerpo
    }
  } catch {
    return url;
  }
}

/* ===================== Página ===================== */

export default function ArtistsBrowse() {
  const [artists, setArtists] = useState<ArtistLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Mapa de URL original -> URL para mostrar (blob:... o la original)
  const [displayUrlMap, setDisplayUrlMap] = useState<Record<string, string>>({});

  // Cargar artistas
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // soporta dos nombres de colección: Artistas | artists
        const colls = ["Artistas", "artists"];
        const loaded: ArtistLite[] = [];
        for (const cName of colls) {
          const snap: QuerySnapshot<DocumentData> = await getDocs(collection(firebaseDb, cName));
          snap.docs.forEach((d) => {
            const a = d.data() as ArtistDoc;
            if (!a?.slug || !a?.nombre_artistico) return;
            loaded.push({
              id: d.id,
              slug: a.slug,
              nombre_artistico: a.nombre_artistico,
              fotoPerfilUrl: a.fotoPerfilUrl ?? null,
              generos: Array.isArray(a.generos) ? a.generos : [],
            });
          });
          if (loaded.length) break; // si ya encontró en una, listo
        }
        loaded.sort((a, b) => a.nombre_artistico.localeCompare(b.nombre_artistico));
        setArtists(loaded);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Prefetch + map de imágenes (limitando concurrencia)
  useEffect(() => {
    let cancelled = false;
    const urls = artists
      .map((a) => a.fotoPerfilUrl)
      .filter((u): u is string => !!u);

    const FIRST_N = 48;
    const targets = urls.slice(0, FIRST_N);

    const run = async () => {
      const CONC = 6;
      let i = 0;
      const workers = new Array(CONC).fill(0).map(async () => {
        while (i < targets.length && !cancelled) {
          const url = targets[i++];
          try {
            const disp = await cacheImageToDisplayUrl(url);
            if (cancelled) return;
            setDisplayUrlMap((m) => (m[url] ? m : { ...m, [url]: disp }));
          } catch {}
        }
      });
      await Promise.all(workers);
    };

    run();

    // Limpieza: revocar blobs creados en ESTA sesión
    return () => {
      cancelled = true;
      Object.values(displayUrlMap).forEach((u) => {
        if (u && u.startsWith("blob:")) {
          try { URL.revokeObjectURL(u); } catch {}
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artists]);

  // Filtro
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return artists;
    return artists.filter(
      (a) =>
        a.nombre_artistico.toLowerCase().includes(term) ||
        (a.generos ?? []).some((g) => g.toLowerCase().includes(term))
    );
  }, [artists, q]);

  // Lista final con fotoPerfilUrl "resuelta"
  const enhanced = useMemo<ArtistLite[]>(() => {
    return filtered.map((a) => {
      const src = a.fotoPerfilUrl ? (displayUrlMap[a.fotoPerfilUrl] ?? a.fotoPerfilUrl) : null;
      return { ...a, fotoPerfilUrl: src };
    });
  }, [filtered, displayUrlMap]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {/* Header simple (igual a EventBrowser) */}
      <header className="mb-6 text-center">
      <h1 className="text-4xl md:text-8xl font-extrabold tracking-tight">
            Art<span className="bg-gradient-to-r from-[#FE8B02] to-[#FF3403] bg-clip-text text-transparent">istas</span>
          </h1>
      <div className="mx-auto mt-2 h-2 w-40 bg-[radial-gradient(closest-side,rgba(254,139,2,0.5),rgba(0,0,0,0)_70%)] blur-xl" />
        <p className="text-foreground/70 mt-2">
        Descubre a tus DJs y productores favoritos.
        </p>
      </header>

      {/* Buscador (sin hero, mismo patrón que EventBrowser) */}
      <div className="mb-6">
        <input
          ref={inputRef}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#FE8B02]"
          placeholder="Buscar por nombre o género…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden"
            >
              <div className="aspect-square bg-white/10 animate-pulse" />
              <div className="p-3">
                <div className="h-4 w-2/3 bg-white/10 rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-white/10 rounded mt-2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
     ) : enhanced.length === 0 ? (
        <p className="text-foreground/70">No encontramos artistas con ese filtro.</p>
      ) : (
        <>
          {/* Mobile = lista como Clubes/Eventos */}
          <div className="md:hidden">
            <ArtistList artists={enhanced} />
          </div>
      
          {/* Desktop = grilla de tarjetas */}
          <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 gap-5">
            {enhanced.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}