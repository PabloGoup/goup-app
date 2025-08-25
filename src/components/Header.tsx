// src/components/Header.tsx
import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useHasClub } from "@/hooks/useHasClub";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCachedAvatar } from "@/hooks/useCachedAvatar";

import {
  Home,
  Shield,
  Users,
  Building2,
  LogIn,
  CalendarPlus,
  Briefcase,
  UserPlus,
  LogOut,
  User2,
  Binoculars,
  User,
  ChevronDown,
  TicketCheck,
  TicketIcon,
  BugPlayIcon,
  Car,
  CarIcon,
  ShoppingCart,
  QrCode,
} from "lucide-react";
import { MdFavorite } from "react-icons/md";
import { SiCarto, SiCoinmarketcap, SiMarketo } from "react-icons/si";

/* ===== Constantes y helpers ===== */
const BLANK_IMG =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

/** BLANK -> live -> cached; nunca vuelve a BLANK ni oscila */
function useStableAvatarSrc(userId?: string, liveUrl?: string) {
  const cachedUrl = useCachedAvatar(userId, liveUrl);
  const ref = useRef<string>(liveUrl || BLANK_IMG);
  const preferred = cachedUrl || liveUrl;
  useEffect(() => {
    if (preferred && preferred !== ref.current) ref.current = preferred;
  }, [preferred]);
  return ref.current || BLANK_IMG;
}

/** Avatar “sin <img>”: usa background-image (anti-parpadeo en Safari) */
function AvatarCircle({
  src,
  initial,
  className = "",
  initialClass = "text-[10px]",
  label = "Foto de perfil",
  showUserIconIfEmpty = false,
}: {
  src: string;
  initial?: string;
  className?: string;
  initialClass?: string;
  label?: string;
  showUserIconIfEmpty?: boolean;
}) {
  const empty = !src || src === BLANK_IMG;
  return (
    <div
      className={`relative rounded-full overflow-hidden grid place-items-center bg-white/10 ${className}`}
      role="img"
      aria-label={label}
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        contain: "layout paint size",
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
      }}
    >
      {!empty ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${src}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          aria-hidden
        />
      ) : showUserIconIfEmpty ? (
        <User className="w-4 h-4 opacity-90" aria-hidden />
      ) : initial ? (
        <span className={`absolute ${initialClass}`}>{initial}</span>
      ) : null}
    </div>
  );
}

/* ===== Componente principal ===== */
export default function Header() {
  const navigate = useNavigate();
  const { user, dbUser, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { loading: loadingClub, hasClub } = useHasClub();
  const [hasProducer, setHasProducer] = useState(false);

  const liveAvatar = dbUser?.photo_url ?? user?.photoURL ?? undefined;
  const avatarSrc = useStableAvatarSrc(user?.uid, liveAvatar);
  const initial = (dbUser?.nombre ?? user?.email ?? "M")[0];

  function hasRole(r: "admin" | "club_owner" | "productor" | "user") {
    if (!dbUser) return false;
    return dbUser.rol === r || dbUser.rol_extra === r;
  }

  const isAdmin = hasRole("admin");
  const isClubOwner = hasRole("club_owner");
  const isProductor = hasRole("productor");
  const canCreateEvent =
    !!dbUser?.can_create_event || isAdmin || isClubOwner || isProductor;
  const shouldShowRoleRequest =
    !!user && !isAdmin && !isClubOwner && !isProductor;

  // Cerrar dropdown al click fuera / ESC
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Drawer móvil: cerrar si clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const headerElement = document.querySelector("header");
      if (mobileOpen && headerElement && !headerElement.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileOpen]);

  // bloquear scroll al abrir drawer
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "auto";
  }, [mobileOpen]);

  // Cierra menús si el usuario pasa a null
  useEffect(() => {
    if (!user) {
      setOpen(false);
      setMobileOpen(false);
    }
  }, [user]);

  // ¿Tiene productora?
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;
      const ref = doc(db, "productoras", user.uid);
      const snap = await getDoc(ref);
      if (active) setHasProducer(snap.exists());
    })();
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-black border border-white/10 backdrop-blur text-white">
      {/* ======= DESKTOP ======= */}
      <div className="hidden md:flex items-center h-16 px-6 relative">
        {/* Grupo centrado: nav izq + LOGO + nav der */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4 pointer-events-auto">
          <nav className="flex items-center gap-3">
            <NavItem to="/clubes" icon={<Home className="w-4 h-4" />}>Clubes</NavItem>
            <NavItem to="/eventos" icon={<Binoculars className="w-4 h-4" />}>Eventos</NavItem>
          </nav>

          <Link
            to="/eventos"
            className="group relative inline-flex items-center justify-center h-20 px-6 rounded-full
                       text-3xl font-black tracking-tight transition-transform duration-200 hover:scale-110"
            aria-label="GoUp - Inicio"
          >
            <span
              className="absolute -inset-x-3 -inset-y-2 rounded-full
                         bg-[radial-gradient(closest-side,rgba(142,42,252,0.6),rgba(142,42,252,0)_70%)]
                         blur-md opacity-70 group-hover:opacity-100 transition-opacity"
              aria-hidden
            />
            <span className="relative z-10 leading-none drop-shadow-[0_2px_10px_rgba(142,42,252,0.35)]">
              Go<span className="text-[#b688ff]">Up</span>
            </span>
          </Link>

          <nav className="flex items-center gap-3">
            <NavItem to="/artistas" icon={<User className="w-4 h-4" />}>Artistas</NavItem>
            <NavItem to="/favoritos" icon={<MdFavorite className="w-4 h-4" />}>Favoritos</NavItem>
          </nav>
        </div>

        {/* Controles a la derecha */}
        <div className="ml-auto flex items-center gap-3">
          {!user ? (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#8e2afc] text-sm hover:opacity-90"
            >
              <LogIn className="w-4 h-4" /> Iniciar sesión
            </Link>
          ) : (
            <div className="relative" ref={containerRef}>
              <button
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-2 pl-2 pr-2.5 h-9 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 transition"
              >
                <AvatarCircle
                  src={avatarSrc}
                  initial={initial}
                  className="w-6 h-6"
                  label="Foto de perfil"
                />
                <span className="text-l font-semibold transition rounded-md">Menú</span>
                <ChevronDown className="w-4 h-4 opacity-80" />
              </button>

              {open && (
                <div className="absolute z-[70] right-0 top-full mt-2 w-64 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                  <Link
                    to="/perfil"
                    onClick={() => setOpen(false)}
                    className="px-3 py-3 border-b border-white/10 flex items-center gap-3 hover:bg-white/5 transition rounded-md"
                  >
                    <AvatarCircle
                      src={avatarSrc}
                      initial={initial}
                      className="w-9 h-9"
                      initialClass="text-[12px]"
                      label="Ir a mi perfil"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{dbUser?.nombre || "Usuario"}</p>
                      {!!user?.email && <p className="text-white/60 text-xs truncate">{user.email}</p>}
                    </div>
                  </Link>
                  

                  <nav className="py-1 text-sm">
                    {isClubOwner && !loadingClub && (
                      hasClub ? (
                        <MenuLink to="/dashboard/mi-club" onClick={() => setOpen(false)} icon={<Building2 className="w-4 h-4" />}>
                          Mi club
                        </MenuLink>
                      ) : (
                        <MenuLink to="/club/crear" onClick={() => setOpen(false)} icon={<Building2 className="w-4 h-4" />}>
                          Crear club
                        </MenuLink>
                      )
                    )}

                    {shouldShowRoleRequest && (
                      <MenuLink to="/solicitud-acceso" onClick={() => setOpen(false)} icon={<UserPlus className="w-4 h-4" />}>
                        Solicitud de acceso
                      </MenuLink>
                    )}
                     {(User || isProductor || isAdmin || isClubOwner) && (
                      <MenuLink to="/mis-tickets" onClick={() => setOpen(false)} icon={<TicketIcon className="w-4 h-4" />}>
                        Mis Tickets
                      </MenuLink>
                    )}
                    {(User || isProductor || isAdmin || isClubOwner) && (
                      <MenuLink to="/carrito" onClick={() => setOpen(false)} icon={<ShoppingCart className="w-4 h-4" />}>
                       Mi Carrito
                      </MenuLink>
                    )}

                    {(isProductor || isAdmin || isClubOwner) && (
                      <MenuLink to="/mis-eventos" onClick={() => setOpen(false)} icon={<CalendarPlus className="w-4 h-4" />}>
                        Mis eventos
                      </MenuLink>
                    )}

                    {canCreateEvent && (
                      <MenuLink to="/evento/crear" onClick={() => setOpen(false)} icon={<CalendarPlus className="w-4 h-4" />}>
                        Crear evento
                      </MenuLink>
                    )}

                    {(isProductor || isAdmin) && (
                      hasProducer ? (
                        <MenuLink to="/dashboard/productora" onClick={() => setOpen(false)} icon={<Briefcase className="w-4 h-4" />}>
                          Mi productora
                        </MenuLink>
                      ) : (
                        <MenuLink to="/productora/crear" onClick={() => setOpen(false)} icon={<Briefcase className="w-4 h-4" />}>
                          Crear productora
                        </MenuLink>
                      )
                    )}

                    {isAdmin && (
                      <>
                        <MenuLink to="/adminClub" onClick={() => setOpen(false)} icon={<Users className="w-4 h-4" />}>
                          Clubes Admin
                        </MenuLink>
                        <MenuLink to="/admin" onClick={() => setOpen(false)} icon={<Shield className="w-4 h-4" />}>
                          Panel admin
                        </MenuLink>
                        <MenuLink to="/admin/ventas" onClick={() => setOpen(false)} icon={<TicketCheck className="w-4 h-4" />}>
                         Admin Ventas
                        </MenuLink>
                      </>
                    )}

                    <MenuLink to="/perfil" onClick={() => setOpen(false)} icon={<User2 className="w-4 h-4" />}>
                      Mi perfil
                    </MenuLink>

                    <button
                      className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2"
                      onClick={async () => {
                        setOpen(false);
                        try {
                          await signOut();
                        } finally {
                          navigate("/", { replace: true });
                        }
                      }}
                    >
                      <LogOut className="w-4 h-4" /> Cerrar sesión
                    </button>
                  </nav>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ======= MÓVIL ======= */}
      <div className="md:hidden w-full px-4 h-14 flex items-center justify-between">
        <Link
          to="/eventos"
          className="group relative inline-flex items-center justify-center
                     h-14 px-6 rounded-full text-2xl font-black tracking-tight
                     transition-transform duration-200 hover:scale-110"
          aria-label="GoUp - Inicio"
        >
          <span
            className="absolute -inset-x-3 -inset-y-2 rounded-full
                       bg-[radial-gradient(closest-side,rgba(142,42,252,0.6),rgba(142,42,252,0)_70%)]
                       blur-md opacity-70 group-hover:opacity-100 transition-opacity"
            aria-hidden
          />
          <span className="relative z-10 leading-none drop-shadow-[0_2px_10px_rgba(142,42,252,0.35)]">
            Go<span className="text-[#b688ff]">Up</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {!user && (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#8e2afc] text-sm hover:opacity-90"
            >
              <LogIn className="w-4 h-4" /> Iniciar sesión
            </Link>
          )}

          {user && (
            <button
              className="text-sm px-2 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center gap-2"
              onClick={() => setMobileOpen((m) => !m)}
            >
              <span className="font-semibold">Menú</span>
              <ChevronDown className="w-4 h-4 opacity-80" />
            </button>
          )}
        </div>
      </div>

      {/* Drawer móvil: solo si hay usuario */}
      {user && mobileOpen && (
        <div className="fixed z-40 flex">
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setMobileOpen(false)}
          />
          <MobileDrawer
            dbUser={dbUser}
            user={user}
            signOut={signOut}
            isAdmin={isAdmin}
            isClubOwner={isClubOwner}
            loadingClub={loadingClub}
            hasClub={hasClub}
            shouldShowRoleRequest={shouldShowRoleRequest}
            isProductor={isProductor}
            hasProducer={hasProducer}
            setMobileOpen={setMobileOpen}
            avatarUrl={avatarSrc}
            initial={initial}
          />
        </div>
      )}
    </header>
  );
}

/* ======= Helpers visuales ======= */
function NavItem({ to, children, icon }: { to: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative px-2 py-1 rounded flex items-center gap-1.5 transition
         ${isActive ? "text-[#8e2afc]" : "text-white/85 hover:text-white"}
         after:content-[''] after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-0.5 after:bg-[#8e2afc] hover:after:w-full after:transition-all`
      }
    >
      {icon} <span className="font-semibold">{children}</span>
    </NavLink>
  );
}

function MenuLink({
  to, onClick, children, icon,
}: { to: string; onClick?: () => void; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <NavLink to={to} onClick={onClick} className="block px-3 py-2 hover:bg-white/5 flex items-center gap-2">
      {icon} <span>{children}</span>
    </NavLink>
  );
}

/* ======= Drawer móvil ======= */
function MobileDrawer({
  dbUser, user, signOut, isAdmin, isClubOwner, loadingClub, hasClub,
  shouldShowRoleRequest, isProductor, hasProducer, setMobileOpen, avatarUrl, initial,
}: any) {
  const navigate = useNavigate();
  return (
    <div
      className="relative z-50 w-80 max-w=[85vw] bg-black p-4 shadow-2xl border-l border-white/10 animate-slide-in"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Link
            to="/perfil"
            onClick={() => setMobileOpen(false)}
            className="group flex items-center gap-3 px-3 py-3 mb-3 rounded-lg bg-white/5 hover:bg-white/10 active:scale-[.98] transition"
            aria-label="Ir a mi perfil"
          >
            <AvatarCircle
              src={avatarUrl}
              initial={initial}
              className="w-11 h-11 shrink-0"
              initialClass="text-sm"
              label="Foto de perfil"
            />
            <div className="min-w-0">
              <p className="font-semibold truncate">{dbUser?.nombre || "Usuario"}</p>
              {!!user?.email && <p className="text-white/60 text-xs truncate">{user.email}</p>}
            </div>
          </Link>
        </div>
      </div>

      <div className="h-px bg-white/10 my-2" />

      <nav className="space-y-2">
        {isClubOwner && !loadingClub && (
          hasClub ? (
            <MobileNavItem to="/dashboard/mi-club" icon={<Building2 className="w-5 h-5" />}>Mi club</MobileNavItem>
          ) : (
            <MobileNavItem to="/club/crear" icon={<Building2 className="w-5 h-5" />}>Crear club</MobileNavItem>
          )
        )}

        {shouldShowRoleRequest && (
          <MobileNavItem to="/solicitud-acceso" icon={<UserPlus className="w-5 h-5" />}>Solicitud de acceso</MobileNavItem>
        )}
        {(User || isProductor || isAdmin || isClubOwner) && (
          <MobileNavItem to="/mis-tickets" icon={<TicketIcon className="w-5 h-5" />}>Mis Tickets</MobileNavItem>
        )}
         {(User || isProductor || isAdmin || isClubOwner) && (
          <MobileNavItem to="/carrito" icon={<ShoppingCart className="w-5 h-5" />}>Mi Carrito</MobileNavItem>
        )}
        {(isProductor || isAdmin || isClubOwner) && (
          <MobileNavItem to="/mis-eventos" icon={<CalendarPlus className="w-5 h-5" />}>Mis eventos</MobileNavItem>
        )}

{(isProductor || isAdmin || isClubOwner) && (
          <MobileNavItem to="/checkin" icon={<QrCode className="w-5 h-5" />}>Chequear Qr</MobileNavItem>
        )}

        {(!!dbUser?.can_create_event || isAdmin || isClubOwner || isProductor) && (
          <MobileNavItem to="/evento/crear" icon={<CalendarPlus className="w-5 h-5" />}>Crear evento</MobileNavItem>
        )}

        {(isProductor || isAdmin) && (
          hasProducer ? (
            <MobileNavItem to="/dashboard/productora" icon={<Briefcase className="w-5 h-5" />}>Mi productora</MobileNavItem>
          ) : (
            <MobileNavItem to="/productora/crear" icon={<Briefcase className="w-5 h-5" />}>Crear productora</MobileNavItem>
          )
        )}

        {isAdmin && (
          <>
            <MobileNavItem to="/adminClub" icon={<Users className="w-5 h-5" />}>Clubes Admin</MobileNavItem>
            <MobileNavItem to="/admin" icon={<Shield className="w-5 h-5" />}>Panel admin</MobileNavItem>
          </>
        )}

        <div className="h-px bg-white/10 my-2" />

        <MobileNavItem to="/perfil" icon={<User2 className="w-5 h-5" />}>Mi perfil</MobileNavItem>

        <button
          className="w-full text-left px-3 py-2 rounded-md hover:bg-white/5 flex items-center gap-3 text-[15px]"
          onClick={async () => {
            setMobileOpen(false);
            try {
              await signOut();
            } finally {
              navigate("/", { replace: true });
            }
          }}
        >
          <span className="grid place-items-center rounded-md w-9 h-9 bg-white/5 border border-white/10">
            <LogOut className="w-5 h-5" />
          </span>
          Cerrar sesión
        </button>
      </nav>
    </div>
  );
}

function MobileNavItem({
  to, children, icon,
}: { to: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-[15px]
         ${isActive ? "bg-[#8e2afc]/20 text-[#8e2afc]" : "text-white/90 hover:bg-white/5"}`
      }
    >
      <span className="grid place-items-center rounded-md w-9 h-9 bg-white/5 border border-white/10">
        {icon}
      </span>
      <span className="font-medium">{children}</span>
    </NavLink>
  );
}