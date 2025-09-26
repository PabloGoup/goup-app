import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import toast from "react-hot-toast";
import { SiInstagram, SiWhatsapp, SiSpotify, SiSoundcloud, SiTiktok, SiBeatport, SiYoutube, SiFacebook, SiX, SiWeb3Dotjs, SiNaver, SiWebgl, SiLinkerd, SiSitecore } from "react-icons/si";
import { LuGlobe } from "react-icons/lu";
import { useFav } from "@/hooks/useFav";


/* ===================== Tipos ===================== */
type ArtistDoc = {
  nombre_artistico: string;
  slug: string;
  fotoPerfilUrl?: string | null;
  generos?: string[] | null;
  bio_corta?: string | null;
  bio_larga?: string | null;
  redes?: {
    instagram?: string | null;
    soundcloud?: string | null;
    spotify?: string | null;
    beatport?: string | null;
    website?: string | null;
  } | null;
};

type EventDoc = {
  nombre: string;
  flyer?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  generos?: string[] | null;
  clubId?: string | null;
};

type EventData = {
  id: string;
  nombre: string;
  flyer?: string | null;
  start: number | null;
  end: number | null;
  generos: string[];
  clubId?: string | null;
};

/* ===================== Iconitos (inline) ===================== */
const IconHeart = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12.1 21s-7.6-4.4-9.3-9.2C1.9 8.2 4 6 6.5 6c1.6 0 3 .9 3.6 2.3C10.7 6.9 12.1 6 13.7 6 16.2 6 18.3 8.2 18 11.8 16.3 16.6 12.1 21 12.1 21z" />
  </svg>
);
const IconShare = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.02-4.11A2.99 2.99 0 1 0 14 5a2.9 2.9 0 0 0 .04.49L7.02 9.6a3 3 0 1 0 0 4.8l7.02 4.11c-.02.16-.04.33-.04.49a3 3 0 1 0 3-3z" />
  </svg>
);
const IconIG = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.2A2.8 2.8 0 1 0 12 15.8 2.8 2.8 0 0 0 12 9.2zM17.5 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>
);
const IconSpotify = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 496 512" fill="currentColor" {...p}><path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm108.8 328.3c-11.2 17.4-28.1 24.5-44.5 13.8-40.3-26.6-91-62.5-103.8-70.2-6.2-3.7-12.4-3.7-18.6 0-12.6 7.7-63.5 43.6-103.8 70.2-16.4 10.7-33.3 3.6-44.5-13.8-11.2-17.4-3.6-33.3 13.8-44.5 40.3-26.6 91-62.5 103.8-70.2 6.2-3.7 12.4-3.7 18.6 0 12.6 7.7 63.5 43.6 103.8 70.2 16.4 10.7 33.3 3.6 44.5-13.8s3.6-33.3-13.8-44.5c-40.3-26.6-91-62.5-103.8-70.2-6.2-3.7-12.4-3.7-18.6 0-12.6 7.7-63.5 43.6-103.8 70.2-16.4 10.7-33.3 3.6-44.5-13.8-11.2-17.4-3.6-33.3 13.8-44.5 40.3-26.6 91-62.5 103.8-70.2 17.4-11.2 24.5-28.1 13.8-44.5z"/></svg>
);
const IconSC = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" fill="currentColor" {...p}><path d="M96 256a64 64 0 1 0-64-64a64 64 0 0 0 64 64zm368-144h-16a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h16a16 16 0 0 0 16-16V128a16 16 0 0 0-16-16zm-64 176h-16a16 16 0 0 0-16 16v112a16 16 0 0 0 16 16h16a16 16 0 0 0 16-16V304a16 16 0 0 0-16-16zm-64 128h-16a16 16 0 0 1-16-16V304a16 16 0 0 1 16-16h16a16 16 0 0 1 16 16v96a16 16 0 0 1-16 16zm-64-112h-16a16 16 0 0 0-16 16v96a16 16 0 0 0 16 16h16a16 16 0 0 0 16-16v-96a16 16 0 0 0-16-16z"/></svg>
);
const IconBeatport = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" fill="currentColor" {...p}><path d="M360.5 256c0 13.1-4.7 25.1-12.5 34.3c-7.8 9.2-18.7 14.5-30.8 14.5c-11.9 0-22.9-5.1-30.9-14.3C278.4 281.3 274 269 274 256s4.4-25.3 12.3-34.5c8-9.4 19-14.5 30.9-14.5c12.1 0 23 5.3 30.8 14.5c7.8 9.2 12.5 21.2 12.5 34.3zM256 32C132.3 32 32 132.3 32 256s100.3 224 224 224s224-100.3 224-224S379.7 32 256 32zm0 320c-88.4 0-160-71.6-160-160s71.6-160 160-160s160 71.6 160 160s-71.6 160-160 160z"/></svg>
);
const IconGlobe = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 17.93V20h-2v-.07A8.001 8.001 0 0 1 4.07 13H4v-2h.07A8.001 8.001 0 0 1 11 4.07V4h2v.07A8.001 8.001 0 0 1 19.93 11H20v2h-.07A8.001 8.001 0 0 1 13 19.93z"/></svg>
);

/* ===================== Helpers ===================== */
const toTs = (iso?: string | null) => (iso ? new Date(iso).getTime() : null);
const fmtDateLong = (ts: number | null) =>
  ts != null
    ? new Date(ts).toLocaleDateString("es-CL", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "Próximamente";

/* ===================== Página ===================== */
export default function ArtistDetail() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const db = getFirestore();

  const [artist, setArtist] = useState<ArtistDoc | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<string | null>(null);
  const { fav, toggleFav } = useFav("artist", artistId ?? "");

  /* ---------- fetch artista ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const qA = query(collection(db, "Artistas"), where("slug", "==", slug));
        const sA = await getDocs(qA);
        const docA = sA.docs[0];
        if (!docA) {
          toast.error("Artista no encontrado");
          navigate("/artistas");
          return;
        }
        const data = docA.data() as ArtistDoc;
               if (alive) {
                  setArtist(data);
                 setArtistId(docA.id); }
      } finally {
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [db, slug, navigate]);

  /* ---------- fetch eventos relacionados ---------- */
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    (async () => {
      try {
        // 1) estrategia por artistasSlugs
        const q1 = query(collection(db, "evento"), where("artistasSlugs", "array-contains", slug));
        const s1 = await getDocs(q1);
        let list: EventData[] = s1.docs.map((d) => {
          const e = d.data() as EventDoc;
          return {
            id: d.id,
            nombre: e?.nombre ?? "Evento",
            flyer: e?.flyer ?? null,
            start: toTs(e?.fechaInicio),
            end: toTs(e?.fechaFin),
            generos: Array.isArray(e?.generos) ? (e.generos as string[]) : [],
            clubId: e?.clubId ?? null,
          };
        });

        // 2) si no encontró nada, intenta con campo "artistas"
        if (list.length === 0) {
          const s2 = await getDocs(collection(db, "evento"));
          list = s2.docs
            .map((d) => {
              const e = d.data() as EventDoc & { artistas?: any[] };
              return {
                id: d.id,
                nombre: e?.nombre ?? "Evento",
                flyer: e?.flyer ?? null,
                start: toTs(e?.fechaInicio),
                end: toTs(e?.fechaFin),
                generos: Array.isArray(e?.generos) ? (e.generos as string[]) : [],
                clubId: e?.clubId ?? null,
                artistas: Array.isArray((e as any)?.artistas) ? (e as any).artistas : [],
              } as any;
            })
            .filter((x: any) => {
              const arr: any[] = x.artistas ?? [];
              return arr.some((a) => (typeof a === "string" ? a === slug : a?.slug === slug));
            })
            .map((x: any) => {
              const { artistas, ...rest } = x;
              return rest as EventData;
            });
        }

        // orden por inicio
        list.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
        if (alive) setEvents(list);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { alive = false; };
  }, [db, slug]);

  /* ---------- acciones ---------- */
  const onFav = useCallback(() => {
    const next = !fav;
    toggleFav();
    toast.success(next ? "Agregado a favoritos" : "Quitado de favoritos");
  }, [fav, toggleFav]);

  const onShare = useCallback(async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: artist?.nombre_artistico ?? "Artista", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Enlace copiado");
      }
    } catch {
      // usuario canceló share
    }
  }, [artist]);

  const socials = useMemo(() => {
    const r = artist?.redes || {};
    const norm = (s?: string | null) => (s && s.trim() ? s.trim() : null);
    return {
      instagram: norm(r?.instagram),
      spotify: norm(r?.spotify),
      soundcloud: norm(r?.soundcloud),
      beatport: norm(r?.beatport),
      website: norm(r?.website),
    };
  }, [artist]);

  if (loading) return <div className="p-6">Cargando artista…</div>;
  if (!artist) return null;

  const avatar = artist.fotoPerfilUrl || "https://placehold.co/600x600/0f0f13/fff?text=Artista";
  const name = artist.nombre_artistico || "Artista";

  return (
    <div>
 {/* HERO */}
<section className="relative isolate w-full overflow-visible -mb-24 md:-mb-32">
  <div
    className="pointer-events-none absolute -inset-x-40 -top-32 -bottom-32 -z-10 overflow-visible"
    style={{
      WebkitMaskImage:
        "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
      maskImage:
        "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
    }}
  >
          <>
            <img
              src={avatar}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover scale-[1.35] blur-[72px] opacity-[0.55]"
            />
            <div className="absolute inset-0 [background:radial-gradient(1200px_560px_at_64%_32%,rgba(0,0,0,0)_0%,rgba(0,0,0,.55)_60%,rgba(0,0,0,.98)_100%)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/80" />
          </>
        </div>

        {/* Contenido del hero */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-14">
          <div className="grid gap-8 md:gap-10 md:grid-cols-[300px_1fr] items-start">
            {/* Avatar redondo con aro y controles */}
            <figure className="relative w-[240px] md:w-[300px] aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
              <div className="relative w-[100%] aspect-square  ring-4 ring-[#FE8B02]/40 overflow-hidden">
                <img src={avatar} alt={name} className="w-full h-full object-cover" loading="eager" />
                
              </div>
            </figure>

            {/* Meta + acciones */}
            <div className="min-w-0">
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">{name}</h1>

              {artist.generos?.length ? (
                <div className="flex flex-wrap gap-2 mt-3">
                  {(artist.generos || []).map((g) => (
                    <span key={g} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">
                      {g}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* Barra de CTA como en evento/club */}
              <div className="mt-6">
                <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white/70 leading-none">Acciones</p>
                    <p className="text-base font-semibold truncate">Sigue y comparte este artista</p>
                    <div className="absolute right-1 bottom-1.5 flex gap-1.5">
                  <button
                    onClick={onFav}
                    title="Favorito"
                    className={`rounded-full bg-black/60 hover:bg-black/75 border border-white/15 p-3 ${fav ? "text-pink-400" : ""}`}
                  >
                    <IconHeart className="w-6 h-6" />
                  </button>
                  <button
                    onClick={onShare}
                    title="Compartir"
                    className="rounded-full bg-black/60 hover:bg-black/75 border border-white/15 p-3"
                  >
                    <IconShare className="w-6 h-6" />
                  </button>
                </div>
                  </div>
                 
                </div>
              </div>

              {/* Socials alineados a la derecha en desktop */}
              <div className="mt-4 flex items-center gap-3">
              {socials.instagram && (
    <a href={socials.instagram} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <SiInstagram className="w-4 h-4" />
    </a>
  )}
               {socials.spotify && (
    <a href={socials.spotify} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <SiSpotify className="w-4 h-4" />
    </a>
  )}
                        {socials.soundcloud && (
    <a href={socials.soundcloud} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <SiSoundcloud className="w-4 h-4" />
    </a>
  )}
                           {socials.beatport && (
    <a href={socials.beatport} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <SiBeatport className="w-4 h-4" />
    </a>
  )}
                          {socials.website && (
    <a href={socials.website} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <LuGlobe className="w-4 h-4" />
    </a>
  )}
              </div>

              {/* Volver / admin (opcional) */}
              <div className="mt-4">
                <Link to="/artistas" className="inline-flex items-center px-3 py-1.5 rounded border /20 hover:bg-white/10 text-sm font-semibold">
                  ← Ver artistas
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="h-24 md:h-20" />
  

      {/* ===== CONTENIDO ===== */}
      <main className="max-w-6xl mx-auto px-4 pb-10">
      <div className="relative z-10 max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-14">
          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Sobre */}
            <section className="p-5 bg-white/[0.03] rounded-xl border /10">
              <h2 className="text-lg font-bold text-[#cbb3ff] mb-2">Sobre {name}</h2>
              {artist.bio_corta ? (
                <p className="/80 leading-relaxed">{artist.bio_corta}</p>
              ) : (
                <p className="/60">Pronto agregaremos la biografía.</p>
              )}
              {artist.bio_larga ? (
                <p className="/80 leading-relaxed mt-3">{artist.bio_larga}</p>
              ) : null}
            </section>

            {/* Próximos eventos */}
            <section className="p-5 bg-white/[0.03] rounded-xl border /10">
              <h2 className="text-lg font-bold text-[#cbb3ff] mb-3">Próximos eventos</h2>
              {events.length === 0 ? (
                <p className="/70">No hay eventos próximos.</p>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {events.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => navigate(`/mis-eventos/${ev.id}`)}
                      className="relative group rounded-2xl select-none text-left"
                      aria-label={`Abrir ${ev.nombre}`}
                    >
                      <div className="relative rounded-2xl overflow-hidden bg-card ring-1 ring-border hover:ring-primary/60 transform-gpu transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.02]">
                        <div className="relative w-full pt-[100%]">
                          <img
                            src={ev.flyer || "https://placehold.co/800x800/101013/FFF?text=Evento"}
                            alt={ev.nombre}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <div className="p-3">
                          <p className="font-semibold text-sm truncate">{ev.nombre}</p>
                          <p className="text-xs text-foreground/70">{fmtDateLong(ev.start)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Aside */}
          <aside className="space-y-6">
            <section className="p-5 bg-white/[0.03] rounded-xl border /10">
              <h3 className="text-sm font-semibold text-[#cbb3ff] mb-2">Contacto</h3>
              <p className="/70 text-sm">Pronto agregaremos booking y enlaces de contacto.</p>
              <div className="flex gap-2 mt-3">
              {socials.instagram && (
    <a href={socials.instagram} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <SiInstagram className="w-4 h-4" />
    </a>
  )}
               {socials.spotify && (
    <a href={socials.spotify} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <SiSpotify className="w-4 h-4" />
    </a>
  )}
                        {socials.soundcloud && (
    <a href={socials.soundcloud} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <SiSoundcloud className="w-4 h-4" />
    </a>
  )}
                           {socials.beatport && (
    <a href={socials.beatport} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <SiBeatport className="w-4 h-4" />
    </a>
  )}
                          {socials.website && (
    <a href={socials.website} target="_blank" rel="noopener noreferrer" title="Instagram"
       className="rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2">
      <SiSitecore className="w-4 h-4" />
    </a>
  )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}