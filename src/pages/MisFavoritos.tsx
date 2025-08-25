// src/pages/Favorites.tsx
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Firestore, getDoc, doc, collection, query, where, getDocs } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";
import { listFavIds } from "@/lib/favs";
import { useFav } from "@/hooks/useFav";

/* ===================== Tipos ===================== */
type Tab = "club" | "event" | "artist";

type ClubDoc = {
  nombre: string;
  imagen?: string | null;
  img_portada?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  pais?: string | null;
};

type EventDoc = {
  nombre: string;
  flyer?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
};

type ArtistDoc = {
  slug: string;
  nombre_artistico: string;
  fotoPerfilUrl?: string | null;
  generos?: string[] | null;
};

/* ===================== Helpers ===================== */
const ph = "https://placehold.co/800x800/101013/FFF?text=GoUp";
const phSq = "https://placehold.co/160x160/101013/FFF?text=•";

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/* ===================== Acciones comunes ===================== */
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
        e.preventDefault();
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
const Share = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M18 16.1a3 3 0 0 0-2.4 1.2l-7-4a3 3 0 0 0 0-2.6l7-4A3 3 0 1 0 16 5a3 3 0 0 0 .2 1l-7 4a3 3 0 1 0 0 4l7 4a3 3 0 1 0 1.8-1.9z" />
  </svg>
);

/* ===================== Card Desktop ===================== */
function FavTile({
  to,
  img,
  title,
  subtitle,
  type,
  id,
  onOpen, // FIX: permite side-effect antes de navegar (ej. set localStorage)
}: {
  to: string;
  img?: string | null;
  title: string;
  subtitle?: string;
  type: "club" | "event" | "artist";
  id: string;
  onOpen?: () => void; // FIX
}) {
  const { fav, toggleFav } = useFav(type, id);

  return (
    <div className="group relative rounded-2xl overflow-hidden border border-white/10 bg-white/[0.04] transition-transform hover:-translate-y-0.5 hover:shadow-lg">
      <Link
        to={to}
        className="block"
        onClick={() => {
          onOpen?.(); // FIX
        }}
      >
        {/* Cuadrado estable */}
        <div className="relative w-full pt-[100%]">
          <img
            src={img || ph}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      </Link>

      {/* Acciones */}
      <div className="absolute top-2 right-2 flex gap-2">
        <button
          onClick={(e) => {
            e.preventDefault();
            toggleFav();
          }}
          title={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
          className={`inline-flex w-9 h-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/75 border border-white/15 ${
            fav ? "text-pink-400" : "text-white"
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41.99 4.22 2.48C11.53 4.99 13.2 4 14.94 4 17.44 4 19.5 6 19.5 8.5c0 3.78-3.4 6.86-8.05 11.54L12 21.35z" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            navigator.share?.({ title, url: location.origin + to });
          }}
          title="Compartir"
          className="inline-flex w-9 h-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/75 border border-white/15"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.02-4.11A2.99 2.99 0 1 0 14 5a2.9 2.9 0 0 0 .04.49L7.02 9.6a3 3 0 1 0 0 4.8l7.02 4.11c-.02.16-.04.33-.04.49a3 3 0 1 0 3-3z" />
          </svg>
        </button>
      </div>

      <div className="p-3">
        <Link to={to} onClick={() => onOpen?.()} className="block font-semibold truncate hover:underline" title={title}>
          {title}
        </Link>
        {subtitle ? <p className="text-xs text-white/70 truncate">{subtitle}</p> : null}
      </div>
    </div>
  );
}

/* ===================== Row Mobile (club / event / artist) ===================== */
function FavRowClub({
  id,
  nombre,
  img,
  sub,
}: {
  id: string;
  nombre: string;
  img: string | null;
  sub?: string;
}) {
  const navigate = useNavigate();
  const { fav, toggleFav } = useFav("club", id);

  return (
    <button
      className="w-full rounded-2xl text-left bg-white/[0.04] border border-white/10 px-3 py-3 flex items-center gap-3"
      onClick={() => {
        localStorage.setItem("adminSelectedClubId", id);
        navigate("/miClub");
      }}
      aria-label={`Abrir ${nombre}`}
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
        <img
          src={img || phSq}
          alt={nombre}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate">{nombre}</p>
        {sub ? <p className="text-[11px] text-white/70 truncate">{sub}</p> : null}
      </div>

      <div className="ml-auto flex items-center gap-2 pl-2">
        <IconBtn title={fav ? "Quitar de favoritos" : "Agregar a favoritos"} onClick={() => toggleFav()}>
          <Heart />
        </IconBtn>
        <IconBtn
          title="Compartir"
          onClick={() =>
            navigator.share?.({
              title: nombre,
              url: location.origin + "/miClub",
            })
          }
        >
          <Share />
        </IconBtn>
      </div>
    </button>
  );
}

function FavRowEvent({
  id,
  nombre,
  img,
  sub,
}: {
  id: string;
  nombre: string;
  img: string | null;
  sub?: string;
}) {
  const navigate = useNavigate();
  const { fav, toggleFav } = useFav("event", id);

  return (
    <button
      className="w-full rounded-2xl text-left bg-white/[0.04] border border-white/10 px-3 py-3 flex items-center gap-3"
      onClick={() => navigate(`/mis-eventos/${id}`)}
      aria-label={`Abrir ${nombre}`}
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
        <img
          src={img || phSq}
          alt={nombre}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate">{nombre}</p>
        {sub ? <p className="text-[11px] text-white/70 truncate">{sub}</p> : null}
      </div>

      <div className="ml-auto flex items-center gap-2 pl-2">
        <IconBtn title={fav ? "Quitar de favoritos" : "Agregar a favoritos"} onClick={() => toggleFav()}>
          <Heart />
        </IconBtn>
        <IconBtn
          title="Compartir"
          onClick={() =>
            navigator.share?.({
              title: nombre,
              url: location.origin + `/mis-eventos/${id}`,
            })
          }
        >
          <Share />
        </IconBtn>
      </div>
    </button>
  );
}

function FavRowArtist({
  id,
  slug,
  nombre,
  img,
  sub,
}: {
  id: string;
  slug: string;
  nombre: string;
  img: string | null;
  sub?: string;
}) {
  const navigate = useNavigate();
  const { fav, toggleFav } = useFav("artist", id);

  return (
    <button
      className="w-full rounded-2xl text-left bg-white/[0.04] border border-white/10 px-3 py-3 flex items-center gap-3"
      onClick={() => navigate(`/artistas/${slug}`)}
      aria-label={`Abrir ${nombre}`}
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
        <img
          src={img || phSq}
          alt={nombre}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate">{nombre}</p>
        {sub ? <p className="text-[11px] text-white/70 truncate">{sub}</p> : null}
      </div>

      <div className="ml-auto flex items-center gap-2 pl-2">
        <IconBtn title={fav ? "Quitar de favoritos" : "Agregar a favoritos"} onClick={() => toggleFav()}>
          <Heart />
        </IconBtn>
        <IconBtn
          title="Compartir"
          onClick={() =>
            navigator.share?.({
              title: nombre,
              url: location.origin + `/artistas/${slug}`,
            })
          }
        >
          <Share />
        </IconBtn>
      </div>
    </button>
  );
}

/* ===================== Página ===================== */
export default function FavoritesPage() {
  const [tab, setTab] = useState<Tab>("club");

  const [clubs, setClubs] = useState<
    Array<{ id: string; nombre: string; img: string | null; sub?: string }>
  >([]);
  const [events, setEvents] = useState<
    Array<{ id: string; nombre: string; img: string | null; sub?: string }>
  >([]);
  const [artists, setArtists] = useState<
    Array<{ id: string; slug: string; nombre: string; img: string | null; sub?: string }>
  >([]);

  useEffect(() => {
    let alive = true;

    async function loadClubs(ids: string[]) {
      const list = await Promise.all(
        ids.map(async (id) => {
          const snap = await getDoc(doc(firebaseDb as Firestore, "club", id));
          if (!snap.exists()) return null;
          const c = snap.data() as ClubDoc;
          return {
            id,
            nombre: c?.nombre ?? "Club",
            img: (c?.img_portada ?? c?.imagen ?? null) || null,
            sub: [c?.direccion, c?.ciudad, c?.pais].filter(Boolean).join(", ") || undefined,
          };
        })
      );
      return list.filter(Boolean) as typeof clubs;
    }

    async function loadEvents(ids: string[]) {
      const list = await Promise.all(
        ids.map(async (id) => {
          const snap = await getDoc(doc(firebaseDb as Firestore, "evento", id));
          if (!snap.exists()) return null;
          const e = snap.data() as EventDoc;
          const sub = [fmtDate(e?.fechaInicio), e?.fechaFin ? `– ${fmtDate(e.fechaFin)}` : ""]
            .filter(Boolean)
            .join(" ");
          return { id, nombre: e?.nombre ?? "Evento", img: e?.flyer ?? null, sub };
        })
      );
      return list.filter(Boolean) as typeof events;
    }

    async function loadArtists(ids: string[]) {
      const list = await Promise.all(
        ids.map(async (rawId) => {
          // 1) intentar por ID
          let snap = await getDoc(doc(firebaseDb as Firestore, "Artistas", rawId));
          if (!snap.exists()) snap = await getDoc(doc(firebaseDb as Firestore, "artists", rawId));

          // 2) si NO existe: quizá era slug guardado antiguamente
          if (!snap.exists()) {
            const tryBySlug = async (coll: "Artistas" | "artists") => {
              const qA = query(collection(firebaseDb as Firestore, coll), where("slug", "==", rawId));
              const sA = await getDocs(qA);
              return sA.docs[0] ?? null;
            };
            const bySlug = (await tryBySlug("Artistas")) || (await tryBySlug("artists"));
            if (bySlug) {
              snap = bySlug;
              try {
                localStorage.removeItem(`fav:artist:${rawId}`);
                localStorage.setItem(`fav:artist:${bySlug.id}`, "1");
                window.dispatchEvent(
                  new StorageEvent("storage", { key: `fav:artist:${bySlug.id}`, newValue: "1" })
                );
              } catch {}
            }
          }

          if (!snap.exists()) return null;
          const data = snap.data() as ArtistDoc;
          return {
            id: snap.id,
            slug: data.slug,
            nombre: data.nombre_artistico,
            img: data.fotoPerfilUrl ?? null,
            sub: (data.generos ?? []).slice(0, 3).join(" · "),
          };
        })
      );
      return list.filter(Boolean) as Array<{
        id: string;
        slug: string;
        nombre: string;
        img: string | null;
        sub?: string;
      }>;
    }

    (async () => {
      const [c, e, a] = await Promise.all([
        loadClubs(listFavIds("club")),
        loadEvents(listFavIds("event")),
        loadArtists(listFavIds("artist")),
      ]);
      if (!alive) return;
      setClubs(c);
      setEvents(e);
      setArtists(a);
    })();

    const onStorage = () => {
      (async () => {
        const [c, e, a] = await Promise.all([
          loadClubs(listFavIds("club")),
          loadEvents(listFavIds("event")),
          loadArtists(listFavIds("artist")),
        ]);
        if (!alive) return;
        setClubs(c);
        setEvents(e);
        setArtists(a);
      })();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const counts = { club: clubs.length, event: events.length, artist: artists.length };
  const grid = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5";

  /* ===================== Render ===================== */
  return (
    <div>
      {/* Hero simple */}
      <section className="relative isolate w-full overflow-visible -mb-4">
        <div className="max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-6">
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#b688ff] text-center">
            Mis favoritos
          </h1>
          <p className="text-center text-white/70 mt-2">
            Guarda en un solo lugar tus artistas, clubes y eventos.
          </p>
        </div>
      </section>

      {/* Tabs */}
      <div className="sticky top-0 z-20 backdrop-blur text-center">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-1">
            {(["club", "event", "artist"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition
                  ${tab === t ? "bg-[#8e2afc] text-white" : "hover:bg-white/10"}`}
              >
                {t === "club" ? "Clubes" : t === "event" ? "Eventos" : "Artistas"} ({counts[t]})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <main className="max-w-6xl mx-auto px-4 pb-10">
        {/* ==== CLUBES ==== */}
        {tab === "club" &&
          (counts.club === 0 ? (
            <EmptyBlock text="Aún no has marcado clubes como favoritos." linkText="Explorar clubes" to="/" />
          ) : (
            <>
              {/* móvil: lista */}
              <div className="md:hidden space-y-3">
                {clubs.map((c) => (
                  <FavRowClub key={c.id} id={c.id} nombre={c.nombre} img={c.img} sub={c.sub} />
                ))}
              </div>
              {/* desktop: grilla */}
              <div className={`hidden md:grid ${grid}`}> {/* FIX */}
                {clubs.map((c) => (
                  <FavTile
                    key={c.id}
                    id={c.id}
                    type="club"
                    to="/miClub"
                    onOpen={() => localStorage.setItem("adminSelectedClubId", c.id)} // FIX: pasar id
                    img={c.img}
                    title={c.nombre}
                    subtitle={c.sub}
                  />
                ))}
              </div>
            </>
          ))}

        {/* ==== EVENTOS ==== */}
        {tab === "event" &&
          (counts.event === 0 ? (
            <EmptyBlock text="Aún no has marcado eventos como favoritos." linkText="Explorar eventos" to="/eventos" />
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {events.map((e) => (
                  <FavRowEvent key={e.id} id={e.id} nombre={e.nombre} img={e.img} sub={e.sub} />
                ))}
              </div>
              <div className={`hidden md:grid ${grid}`}> {/* FIX */}
                {events.map((e) => (
                  <FavTile
                    key={e.id}
                    id={e.id}
                    type="event"
                    to={`/mis-eventos/${e.id}`}
                    img={e.img}
                    title={e.nombre}
                    subtitle={e.sub}
                  />
                ))}
              </div>
            </>
          ))}

        {/* ==== ARTISTAS ==== */}
        {tab === "artist" &&
          (counts.artist === 0 ? (
            <EmptyBlock
              text="Aún no has marcado artistas como favoritos."
              linkText="Explorar artistas"
              to="/artistas"
            />
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {artists.map((a) => (
                  <FavRowArtist
                    key={a.id}
                    id={a.id}
                    slug={a.slug}
                    nombre={a.nombre}
                    img={a.img}
                    sub={a.sub}
                  />
                ))}
              </div>
              <div className={`hidden md:grid ${grid}`}> {/* FIX */}
                {artists.map((a) => (
                  <FavTile
                    key={a.id}
                    id={a.id}
                    type="artist"
                    to={`/artistas/${a.slug}`}
                    img={a.img}
                    title={a.nombre}
                    subtitle={a.sub}
                  />
                ))}
              </div>
            </>
          ))}
      </main>
    </div>
  );
}

/* ===================== Empty ===================== */
function EmptyBlock({ text, linkText, to }: { text: string; linkText: string; to: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
      <p className="text-white/70">{text}</p>
      <Link
        to={to}
        className="inline-block mt-3 px-4 py-2 rounded-full bg-[#8e2afc] hover:bg-[#7b1fe0] text-sm font-semibold"
      >
        {linkText}
      </Link>
    </div>
  );
}