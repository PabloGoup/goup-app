// src/components/ArtistCard.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useFav } from "@/hooks/useFav";

export type ArtistLite = {
  id: string;
  slug: string;
  nombre_artistico: string;
  fotoPerfilUrl?: string | null;
  generos?: string[] | null;
};

export default function ArtistCard({ artist }: { artist: ArtistLite }) {
  const navigate = useNavigate();
  // Usamos el SLUG como id para favoritos de artistas
  const { fav, toggleFav } = useFav("artist", artist.id);

  const cover =
    artist.fotoPerfilUrl || "https://placehold.co/800x800/101013/FFF?text=Artista";

  const onShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${location.origin}/artistas/${artist.slug}`;
    const text = `Mira a ${artist.nombre_artistico} en GoUp: ${url}`;
    if (navigator.share) {
      navigator.share({ title: artist.nombre_artistico, text, url }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
  };

  return (
    <div className="relative group rounded-2xl select-none text-left">
      {/* Glow */}
      <div
        className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-black/40 mix-blend-screen opacity-60 group-hover:opacity-35 transition-opacity"
        aria-hidden
      />
      <div
        className="
          relative rounded-2xl overflow-hidden
          bg-card ring-1 ring-border hover:ring-primary/60
          shadow-[0_0_0_0_rgba(142,42,252,0)]
          hover:shadow-[0_18px_42px_-10px_rgba(142,42,252,0.35)]
          transform-gpu transition duration-300
          group-hover:-translate-y-0.5 group-hover:scale-[1.02]
          cursor-pointer
        "
        onClick={() => navigate(`/artistas/${artist.slug}`)}
        aria-label={`Abrir ${artist.nombre_artistico}`}
      >
        {/* Media cuadrada */}
        <div className="relative w-full pt-[100%]">
          <img
            src={cover}
            alt={artist.nombre_artistico}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
          />

          {/* Acciones */}
          <div className="absolute left-2 bottom-2 flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); toggleFav(); }}
              title={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
              className={`rounded-full p-2 border border-white/15 bg-black/60 hover:bg-black/75 transition ${fav ? "text-pink-400" : "text-white"}`}
              aria-label="Favorito"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41.99 4.22 2.48C11.53 4.99 13.2 4 14.94 4 17.44 4 19.5 6 19.5 8.5c0 3.78-3.4 6.86-8.05 11.54L12 21.35z" />
              </svg>
            </button>

            <button
              onClick={onShare}
              title="Compartir"
              className="rounded-full p-2 border border-white/15 bg-black/60 hover:bg-black/75 text-white transition"
              aria-label="Compartir"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.02-4.11A2.99 2.99 0 1 0 14 5a2.9 2.9 0 0 0 .04.49L7.02 9.6a3 3 0 1 0 0 4.8l7.02 4.11c-.02.16-.04.33-.04.49a3 3 0 1 0 3-3z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Texto */}
        <div className="p-3 text-center">
          <p className="font-semibold text-sm text-foreground truncate">
            {artist.nombre_artistico}
          </p>
          {artist.generos?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1 justify-center">
              {artist.generos.slice(0, 2).map((g) => (
                <span
                  key={g}
                  className="px-1.5 py-0.5 rounded-full text-[10px] leading-none bg-white/10 border border-white/15"
                >
                  {g}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}