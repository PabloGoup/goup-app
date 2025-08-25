// src/pages/RoleRequestPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/auth/AuthContext";

const db = getFirestore();

type RoleType = "productor" | "club_owner" | "ambos";
type RequestStatus = "pendiente" | "aprobada" | "rechazada";

export default function RoleRequestPage() {
  const { user, dbUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [roleType, setRoleType] = useState<RoleType>("productor");

  // 1) Al montar: leer si ya existe solicitud
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    (async () => {
      const reqRef = doc(db, "roleRequests", user.uid);
      const snap = await getDoc(reqRef);
      if (snap.exists()) {
        const data = snap.data() as { tipo: RoleType; estado: RequestStatus };
        setStatus(data.estado);
      }
      setLoading(false);
    })();
  }, [authLoading, user, navigate]);

  // 2) Enviar formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const reqRef = doc(db, "roleRequests", user.uid);
      const snap = await getDoc(reqRef);

      const payload = {
        uid: user.uid,
        tipo: roleType,
        estado: "pendiente" as RequestStatus,
        actualizadoAt: serverTimestamp(),
      };

      if (snap.exists()) {
        // Ya había solicitud: actualizamos
        await updateDoc(reqRef, payload);
      } else {
        // Primera vez: creamos
        await setDoc(reqRef, {
          ...payload,
          creadoAt: serverTimestamp(),
        });
      }

      setStatus("pendiente");
      toast.success("Solicitud enviada correctamente");
    } catch (err: any) {
      console.error(err);
      toast.error("Error al enviar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  if (loading || authLoading) {
    return <p className=" p-6">Cargando…</p>;
  }

  // 3) Si ya tiene estado, mostramos su estado actual
  if (status) {
    return (
      <div className="max-w-md mx-auto p-6 bg-neutral-900 rounded-lg">
        <h2 className="text-xl  mb-4">Estado de tu solicitud</h2>
        <p className="/80 mb-2">
          Tipo: <strong className="">{roleType}</strong>
        </p>
        <p className="/80 mb-4">
          Estado:{" "}
          <span
            className={
              status === "aprobada"
                ? "text-green-400"
                : status === "rechazada"
                ? "text-red-400"
                : "text-yellow-300"
            }
          >
            {status}
          </span>
        </p>
        {status === "rechazada" && (
          <button
            onClick={() => setStatus(null)}
            className="px-4 py-2 bg-[#8e2afc] rounded "
          >
            Volver a solicitar
          </button>
        )}
      </div>
    );
  }

  // 4) Si no hay solicitud: form
  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-md mx-auto p-6 bg-neutral-900 rounded-lg space-y-4"
    >
      <h2 className="text-xl ">Solicita un rol</h2>

      <label className="block">
        <span className="/80">Tipo de solicitud</span>
        <select
          value={roleType}
          onChange={(e) => setRoleType(e.target.value as RoleType)}
          className="mt-1 w-full p-2 bg-zinc-800  rounded"
        >
          <option value="productor">Productor</option>
          <option value="club_owner">Club Owner</option>
          <option value="ambos">Ambos</option>
        </select>
      </label>

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-2 rounded  ${
          loading ? "bg-zinc-700" : "bg-[#8e2afc] hover:bg-[#7b1fe0]"
        }`}
      >
        {loading ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}