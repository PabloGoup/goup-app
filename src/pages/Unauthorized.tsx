// src/pages/Unauthorized.tsx
import { Link } from "react-router-dom";

export default function Unauthorized() {
  return (
    <main className="w-screen h-screen grid place-items-center ">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">403</h1>
        <p className="/70">
          No tienes permisos para ver esta página.
        </p>
        <Link to="/" className="text-[#8e2afc] underline">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}