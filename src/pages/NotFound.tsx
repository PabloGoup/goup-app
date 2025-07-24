// src/pages/NotFound.tsx
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="w-screen h-screen grid place-items-center text-white">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-white/70">Página no encontrada.</p>
        <Link to="/" className="text-[#8e2afc] underline">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}