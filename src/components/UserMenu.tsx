// src/components/UserMenu.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

export default function UserMenu() {
  const { user, dbUser, signOut, signInWithGoogle, loading } = useAuth();
  const [open, setOpen] = useState(false);

  // Mientras carga el estado de auth, nada
  if (loading) {
    return <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse" />;
  }

  // Si no hay usuario, iniciamos sesión con Google
  if (!user) {
    return (
      <button
        onClick={() => signInWithGoogle()}
        className="px-3 py-1.5 rounded-md bg-[#8e2afc]  text-sm hover:opacity-90"
      >
        Iniciar sesión
      </button>
    );
  }

  const avatar =
    dbUser?.foto ||
    (user.photoURL as string | undefined) ||
    user.email?.[0].toUpperCase() ||
    "";
  const name = dbUser?.nombre || user.displayName || user.email || "Usuario";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-full overflow-hidden border /20"
        aria-label="Abrir menú de usuario"
      >
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center bg-white/10  text-sm">
            {name[0]}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-md bg-neutral-900 border /10 shadow-lg text-sm  z-50">
          <div className="px-3 py-2 border-b /10">
            <p className="font-semibold truncate">{name}</p>
            <p className="/60 truncate">{user.email}</p>
          </div>

          <ul className="py-1">
            <li>
              <Link
                to="/profile"
                className="block px-3 py-2 hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                Mi perfil
              </Link>
            </li>

            {dbUser?.rol === "admin" && (
              <li>
                <Link
                  to="/admin"
                  className="block px-3 py-2 hover:bg-white/5"
                  onClick={() => setOpen(false)}
                >
                  Panel admin
                </Link>
              </li>
            )}

            <li>
              <button
                className="w-full text-left px-3 py-2 hover:bg-white/5"
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
              >
                Cerrar sesión
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}