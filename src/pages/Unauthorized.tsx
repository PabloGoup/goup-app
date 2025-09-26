// src/pages/Unauthorized.tsx
import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Unauthorized() {
  const navigate = useNavigate();

  // Redirige suavemente al home tras 2s
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/", { replace: true });
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="w-screen h-screen grid place-items-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">403</h1>
        <p className="text-white/70">
          No tienes permisos para ver esta página. Te redirigimos al inicio…
        </p>
        <Link to="/" className="text-[#FE8B02] underline">
          Ir ahora al inicio
        </Link>
      </div>
    </main>
  );
}