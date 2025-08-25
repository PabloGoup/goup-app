// src/components/BottomNav.tsx
import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Binoculars, User, PartyPopperIcon, EggFriedIcon } from "lucide-react";
import { MdFavorite, MdMobileFriendly } from "react-icons/md";
import { useAuth } from "@/auth/AuthContext";
import { useCachedAvatar } from "@/hooks/useCachedAvatar";
import { LuPartyPopper } from "react-icons/lu";

type IconType = React.ComponentType<{ className?: string }>;

const BLANK_IMG =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="; // 1x1 transparente

/** BLANK -> live -> cached; nunca vuelve a BLANK ni oscila */
function useStableAvatarSrc(userId?: string, liveUrl?: string) {
  const cachedUrl = useCachedAvatar(userId, liveUrl);
  const ref = React.useRef<string>(liveUrl || BLANK_IMG);
  const preferred = cachedUrl || liveUrl;
  React.useEffect(() => {
    if (preferred && preferred !== ref.current) ref.current = preferred;
  }, [preferred]);
  return ref.current || BLANK_IMG;
}

export default function BottomNav() {
  const { dbUser, user } = useAuth();
  const isLogged = !!user;

  const liveUrl = dbUser?.photo_url || undefined;
  const avatarSrc = useStableAvatarSrc(user?.uid, liveUrl);
  const initial = (dbUser?.nombre ?? user?.email ?? "U")[0];

  const items: Array<{ to: string; label: string; icon: IconType }> = [
    { to: "/eventos",  label: "Eventos",   icon: MdMobileFriendly },
    { to: "/clubes",   label: "Clubes",    icon: Home },
    { to: "/artistas", label: "Artistas",  icon: User },
    { to: "/favoritos",label: "Favoritos", icon: MdFavorite },
  ];

  const ItemCell = ({
    to, label, Icon, className,
  }: { to: string; label: string; Icon: IconType; className?: string }) => (
    <li className={className}>
      <NavLink
        to={to}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center h-14 gap-1
           text-xs font-medium transition
           ${isActive ? "text-[#8e2afc]" : "text-white/80 hover:text-white"}`
        }
      >
        <Icon className="w-5 h-5" aria-hidden />
        <span className="leading-none">{label}</span>
      </NavLink>
    </li>
  );

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-[rgba(20,20,22,0.92)] backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", willChange: "transform", transform: "translateZ(0)" }}
      aria-label="Navegación inferior"
    >
      <ul className="grid grid-cols-5">
    
        <ItemCell to={items[1].to} label={items[1].label} Icon={items[1].icon} />
        <ItemCell to={items[0].to} label={items[0].label} Icon={items[0].icon} />
        <ItemCell to={items[3].to} label={items[3].label} Icon={items[3].icon} />
        <ItemCell to={items[2].to} label={items[2].label} Icon={items[2].icon} />
        {/* PERFIL (centro) */}
        <li>
          <NavLink
            to={isLogged ? "/perfil" : "/login"}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center h-14 gap-1
               ${isActive ? "text-[#8e2afc]" : "text-white/80 hover:text-white"}`
            }
            aria-label={isLogged ? "Perfil" : "Iniciar sesión"}
            title={isLogged ? "Perfil" : "Iniciar sesión"}
          >
            {({ isActive }) => (
              <>
                <div
                  className={`
                    relative w-8 h-8 rounded-full overflow-hidden grid place-items-center
                    bg-white/10 transition transform-gpu
                    hover:scale-105 active:scale-95
                    ${isActive
                      ? "ring-2 ring-[#8e2afc] ring-offset-2 ring-offset-[rgba(20,20,22,0.92)]"
                      : "border border-white/15"}
                  `}
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    contain: "layout paint",
                  }}
                >
                  {isLogged && avatarSrc !== BLANK_IMG ? (
                    // ✅ Safari-safe: fondo en vez de <img>
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url("${avatarSrc}")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        transform: "translateZ(0)",
                        WebkitTransform: "translateZ(0)",
                      }}
                      aria-hidden
                    />
                  ) : (
                    // Fallback limpio sin parpadeo (no logueado o sin foto)
                    <User className="w-5 h-5 opacity-90" aria-hidden />
                  )}

                  {/* Si no hay foto pero sí usuario, muestra inicial encima */}
                  {isLogged && avatarSrc === BLANK_IMG && (
                    <span className="absolute text-[11px]">{initial}</span>
                  )}
                </div>
                <span className="sr-only">{isLogged ? "Perfil" : "Iniciar sesión"}</span>
              </>
            )}
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}