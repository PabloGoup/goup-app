// src/components/DebugUser.tsx
import { useAuth } from "@/auth/AuthContext";

export default function DebugUser() {
  const { user, dbUser, rol, loading } = useAuth();

  if (loading) return <p className="">Cargando contexto de autenticación…</p>;

  return (
    <div className="p-6 bg-neutral-900  rounded-md">
      <h2 className="text-2xl font-semibold mb-4">🔍 Debug Firebase Auth & Firestore</h2>
      <div className="mb-4">
        <strong>Firebase Auth User:</strong>
        <pre className="overflow-auto max-h-48 bg-black/50 p-2 rounded">{JSON.stringify(user, null, 2)}</pre>
      </div>
      <div className="mb-4">
        <strong>Firestore “usersWeb” Doc:</strong>
        <pre className="overflow-auto max-h-48 bg-black/50 p-2 rounded">{JSON.stringify(dbUser, null, 2)}</pre>
      </div>
      <div>
        <strong>Rol:</strong> <code>{rol ?? "–"}</code>
      </div>
    </div>
  );
}