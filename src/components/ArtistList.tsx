import React from "react";
import { Link } from "react-router-dom";
import { useFav } from "@/hooks/useFav";
import type { ArtistLite } from "@/types/artist";

function ArtistListItem({ a }: { a: ArtistLite }) {
  const { fav, toggleFav } = useFav("artist", a.id); // <-- ID unificado
  const cover = a.fotoPerfilUrl || "https://placehold.co/160x160/101013/FFF?text=A";

  const share = () => {
    const url = `${location.origin}/artistas/${a.slug}`;
    const text = `Mira a ${a.nombre_artistico} en GoUp: ${url}`;
    if (navigator.share) navigator.share({ title: a.nombre_artistico, text, url }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.04] p-3 flex items-center gap-3">
      <Link to={`/artistas/${a.slug}`} className="shrink-0">
        <img
          src={cover}
          alt={a.nombre_artistico}
          className="w-16 h-16 rounded-lg object-cover border border-white/10"
          loading="lazy"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <Link to={`/artistas/${a.slug}`} className="font-semibold block truncate hover:underline">
          {a.nombre_artistico}
        </Link>
        {!!(a.generos && a.generos.length) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {a.generos.slice(0, 3).map((g) => (
              <span key={g} className="text-[10px] px-2 py-0.5 rounded bg-white/10 border border-white/15">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          title={fav ? "Quitar de favoritos" : "Favorito"}
          onClick={toggleFav}
          className={`inline-flex w-8 h-8 items-center justify-center rounded-full bg-black/60 hover:bg-black/75 border border-white/15 ${fav ? "text-pink-400" : "text-white"}`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41.99 4.22 2.48C11.53 4.99 13.2 4 14.94 4 17.44 4 19.5 6 19.5 8.5c0 3.78-3.4 6.86-8.05 11.54L12 21.35z" />
          </svg>
        </button>

        <button
          type="button"
          title="Compartir"
          onClick={share}
          className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-black/60 hover:bg-black/75 border border-white/15"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.02-4.11A2.99 2.99 0 1 0 14 5a2.9 2.9 0 0 0 .04.49L7.02 9.6a3 3 0 1 0 0 4.8l7.02 4.11c-.02.16-.04.33-.04.49a3 3 0 1 0 3-3z" />
          </svg>
        </button>
      </div>
    </li>
  );
}

export default function ArtistList({ artists }: { artists: ArtistLite[] }) {
  return (
    <ul className="grid gap-3">
      {artists.map((a) => (
        <ArtistListItem key={a.id} a={a} />
      ))}
    </ul>
  );
}