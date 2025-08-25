import React from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

/* ===== Tipos ===== */
type ClubLike = {
  id: string;
  nombre: string;
  imagen?: string | null;
  img_portada?: string | null;
  cover?: string | null;
  direccion?: string | null;
  servicios?: string[] | null;
};

type Props = {
  clubs: ClubLike[];
  /** 'default' = tu estilo anterior; 'event' = look de Eventos, cuadrada + animación */
  variant?: "default" | "event";
};

/* ===== Utils ===== */
const getCover = (c: ClubLike) =>
  c.imagen ||
  c.img_portada ||
  c.cover ||
  "https://placehold.co/800x800/0f0f13/ffffff?text=Club";

const getChips = (c: ClubLike) =>
  Array.isArray(c.servicios) ? c.servicios.slice(0, 3) : [];

const shareClub = async (club: ClubLike) => {
  const url = `${location.origin}/miClub?c=${encodeURIComponent(club.id)}`;
  try {
    if (navigator.share) {
      await navigator.share({
        title: club.nombre,
        text: `Mira este club: ${club.nombre}`,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    }
  } catch {
    /* cancelado */
  }
};

function useFavClub(id: string, name: string) {
  const key = `fav:club:${id}`;
  const [fav, setFav] = React.useState(false);
  React.useEffect(() => {
    setFav(localStorage.getItem(key) === "1");
  }, [key]);
  const toggle = () => {
    const next = !fav;
    setFav(next);
    localStorage.setItem(key, next ? "1" : "0");
    if (next) toast.success(`Agregado a favoritos: ${name}`);
    else toast(`Quitado de favoritos`, { icon: "💔" });
  };
  return { fav, toggle };
}

/* ===== Icon Buttons ===== */
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
const Share = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M18 16.1a3 3 0 0 0-2.4 1.2l-7-4a3 3 0 0 0 0-2.6l7-4A3 3 0 1 0 16 5a3 3 0 0 0 .2 1l-7 4a3 3 0 1 0 0 4l7 4a3 3 0 1 0 1.8-1.9z" />
  </svg>
);

/* ===== Cards (con hooks dentro de cada card, no dentro del map) ===== */
function ClubCardMobile({ club }: { club: ClubLike }) {
  const navigate = useNavigate();
  const cover = getCover(club);
  const chips = getChips(club);
  const { fav, toggle } = useFavClub(club.id, club.nombre);

  return (
    <button
      onClick={() => {
        localStorage.setItem("adminSelectedClubId", club.id);
        navigate("/miClub");
      }}
      className="
        group relative w-full rounded-2xl text-left
        bg-card/90 border border-border/60
        hover:ring-1 hover:ring-primary/40 transition
        shadow-[0_6px_18px_-8px_rgba(0,0,0,.45)]
        px-3 py-3 flex items-center gap-3
      "
      aria-label={`Abrir ${club.nombre}`}
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
        <img
          src={cover}
          alt={club.nombre}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-foreground truncate">{club.nombre}</p>
        {club.direccion && (
          <p className="text-[11px] text-foreground/70 truncate">{club.direccion}</p>
        )}
        {chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {chips.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded-full text-[10px] leading-none bg-muted text-muted-foreground border border-border"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2 pl-2">
        <IconBtn title={fav ? "Quitar de favoritos" : "Agregar a favoritos"} onClick={toggle}>
          <Heart />
        </IconBtn>
        <IconBtn title="Compartir" onClick={() => shareClub(club)}>
          <Share />
        </IconBtn>
      </div>
    </button>
  );
}

function ClubCardDesktop({ club, variant }: { club: ClubLike; variant: "default" | "event" }) {
  const navigate = useNavigate();
  const cover = getCover(club);
  const { fav, toggle } = useFavClub(club.id, club.nombre);

  if (variant === "event") {
    // Look eventos + CUADRADA + animación
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          localStorage.setItem("adminSelectedClubId", club.id);
          navigate("/miClub");
        }}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (localStorage.setItem("adminSelectedClubId", club.id), navigate("/miClub"))}
        className="relative group rounded-2xl select-none text-left"
        aria-label={`Abrir ${club.nombre}`}
      >
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
          "
        >
          {/* acciones */}
          <div className="absolute top-2 right-2 z-10 flex gap-2">
            <IconBtn title={fav ? "Quitar de favoritos" : "Agregar a favoritos"} onClick={toggle}>
              <Heart />
            </IconBtn>
            <IconBtn title="Compartir" onClick={() => shareClub(club)}>
              <Share />
            </IconBtn>
          </div>

          {/* Media cuadrada */}
          <div className="relative w-full pt-[100%]">
            <img
              src={cover}
              alt={club.nombre}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
            />
          </div>

          {/* Texto */}
          <div className="p-3">
            <p className="font-semibold text-sm text-foreground truncate">{club.nombre}</p>
            {club.direccion && (
              <p className="hidden md:block text-xs text-foreground/70 truncate">{club.direccion}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback estilo anterior
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        localStorage.setItem("adminSelectedClubId", club.id);
        navigate("/miClub");
      }}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (localStorage.setItem("adminSelectedClubId", club.id), navigate("/miClub"))}
      className="relative group rounded-2xl select-none text-left"
      aria-label={`Abrir ${club.nombre}`}
    >
      <div
        className="
          pointer-events-none absolute -inset-[2px] rounded-2xl
          opacity-20 group-hover:opacity-45 transition-opacity duration-300
          blur-[14px]
          bg-[conic-gradient(at_30%_30%,#8e2afc99_0deg,#00e5ff99_120deg,#ff3dd199_240deg,#8e2afc99_360deg)]
          animate-[spin_12s_linear_infinite] motion-reduce:animate-none
        "
        aria-hidden
      />
      <div
        className="
          pointer-events-none absolute -inset-0.5 rounded-2xl
          bg-black/40 mix-blend-screen
          opacity-60 group-hover:opacity-35 transition-opacity
        "
        aria-hidden
      />

      <div
        className="
          relative rounded-2xl overflow-hidden
          bg-card backdrop-blur-md
          ring-1 ring-border hover:ring-primary/60
          shadow-[0_0_0_0_rgba(142,42,252,0)]
          hover:shadow-[0_18px_42px_-10px_rgba(142,42,252,0.35)]
          transform-gpu transition duration-300
          group-hover:-translate-y-0.5 group-hover:scale-[1.02]
        "
      >
        {/* acciones */}
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          <IconBtn title={fav ? "Quitar de favoritos" : "Agregar a favoritos"} onClick={toggle}>
            <Heart />
          </IconBtn>
          <IconBtn title="Compartir" onClick={() => shareClub(club)}>
            <Share />
          </IconBtn>
        </div>

        <div className="relative w-full pt-[100%]">
          <img
            src={cover}
            alt={club.nombre}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3 bg-black/30 backdrop-blur-md">
            <p className="font-semibold text-sm text-white truncate drop-shadow">{club.nombre}</p>
            {club.direccion && (
              <p className="hidden md:block text-xs text-white/75 truncate">{club.direccion}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Lista ===== */
export default function ClubList({ clubs, variant = "event" }: Props) {
  return (
    <>
      {/* Mobile */}
      <div className="sm:hidden px-3 space-y-3 mb-8">
        {clubs.map((club) => (
          <ClubCardMobile key={club.id} club={club} />
        ))}
      </div>

      {/* Desktop grid */}
      <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {clubs.map((club) => (
          <ClubCardDesktop key={club.id} club={club} variant={variant} />
        ))}
      </div>
    </>
  );
}