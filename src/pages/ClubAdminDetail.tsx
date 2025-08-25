// src/pages/ClubesAdminDetail.tsx
import { useEffect, useState } from "react";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

type ClubResumen = {
  id: string;
  nombre: string;
  ciudad?: string | null;
  pais?: string | null;
  imagen?: string | null;
};

export default function ClubesAdmin() {
  const { dbUser } = useAuth();
  const navigate = useNavigate();
  const [clubes, setClubes] = useState<ClubResumen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (dbUser?.rol !== "admin") return;
    const fetchClubes = async () => {
      const db = getFirestore();
      const snap = await getDocs(collection(db, "club"));
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ClubResumen[];
      setClubes(data);
      setLoading(false);
    };

    fetchClubes();
  }, [dbUser]);

  if (dbUser?.rol !== "admin") return <p className="p-6 ">Acceso denegado.</p>;
  if (loading) return <p className="p-6 ">Cargando clubes…</p>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 ">
      <h1 className="text-3xl font-bold mb-6">Todos los clubes</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {clubes.map((club) => (
          <div
            key={club.id}
            className="bg-white/5 border /10 rounded-lg p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              {club.imagen ? (
                <img
                  src={club.imagen}
                  alt={club.nombre}
                  className="w-16 h-16 object-cover rounded-full border /20"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-xl">
                  {club.nombre[0]}
                </div>
              )}
              <div>
                <p className="text-lg font-semibold">{club.nombre}</p>
                <p className="text-sm /60">
                  {[club.ciudad, club.pais].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>

            <button
  onClick={() => {
    localStorage.setItem("adminSelectedClubId", club.id); // guardar club.id
    navigate("/miClub"); // navegar
  }}
  className="text-sm px-3 py-1 rounded bg-[#8e2afc] hover:bg-[#7b1fe0] transition"
>
  Ver / Editar
</button>
          </div>
        ))}
      </div>
    </div>
  );
}