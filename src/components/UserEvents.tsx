// src/components/UserEvents.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  Firestore,
} from "firebase/firestore";
import { useAuth } from "@/auth/AuthContext";
import { db as firebaseDb } from "@/lib/firebase";

/* ---------------------- Tipos ---------------------- */
type Evento = {
  id_evento: string;

  // dueño
  uid_usersWeb?: string | null; // "/usersWeb/<uid>"
  uid_creador?: string | null;  // <uid> (legacy)

  // fechas posibles
  fechaInicio?: string | null;  // ISO (nuevo)
  fecha?: string | null;        // "YYYY-MM-DD" (legacy)
  horaInicio?: string | null;
  horaCierre?: string | null;

  nombre: string;
  tipo: string;
  flyer?: string | null;
  imgSec?: string | null;

  // descripción puede haberse guardado como 'descripcion' (nuevo) o 'desc' (legacy)
  descripcion?: string | null;
  desc?: string | null;

  generos?: string[] | string | null;
};

/* ---------------------- Helpers seguros ---------------------- */
const nz = (v: unknown): string => (v == null ? "" : String(v));
const nzArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const normalizeGeneros = (g: unknown): string[] => {
  if (Array.isArray(g)) return g.filter(Boolean).map(String);
  if (typeof g === "string") {
    return g
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

// Devuelve la fecha/hora de inicio del evento sin reventar
function getStartDate(e: Evento): Date {
  // preferimos el campo nuevo ISO
  if (e.fechaInicio) {
    const d = new Date(e.fechaInicio);
    if (!isNaN(d.getTime())) return d;
  }

  // fallback legacy: fecha "YYYY-MM-DD" + horaInicio "HH:mm"
  const dStr = nz(e.fecha);
  const tStr = nz(e.horaInicio) || "00:00";
  if (dStr) {
    // si ya viene con T, parseamos directo
    const composed = dStr.includes("T") ? dStr : `${dStr}T${tStr}`;
    const d = new Date(composed);
    if (!isNaN(d.getTime())) return d;
  }

  // último recurso: ahora (para que no rompa ordenamientos)
  return new Date(0);
}

// Unifica descripción
const getDescripcion = (e: Evento) => nz(e.descripcion ?? e.desc);

/* ---------------------- Componente ---------------------- */
export default function UserEvents() {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      setLoading(true);
      try {
        const col = collection(firebaseDb as Firestore, "evento");

        // nuevos: uid_usersWeb = "/usersWeb/<uid>"
        const qNew = query(col, where("uid_usersWeb", "==", `/usersWeb/${user.uid}`));
        // legacy (por si acaso): uid_creador = "<uid>"
        const qOld = query(col, where("uid_creador", "==", user.uid));

        const [snapNew, snapOld] = await Promise.all([getDocs(qNew), getDocs(qOld)]);

        const byId = new Map<string, Evento>();

        const mapDoc = (doc: any): Evento => {
          const d = doc.data() as any;
          return {
            id_evento: doc.id,
            uid_usersWeb: d?.uid_usersWeb ?? null,
            uid_creador: d?.uid_creador ?? null,

            // fechas
            fechaInicio: d?.fechaInicio ?? null,
            fecha: d?.fecha ?? null,
            horaInicio: d?.horaInicio ?? null,
            horaCierre: d?.horaCierre ?? null,

            nombre: nz(d?.nombre),
            tipo: nz(d?.tipo),
            flyer: d?.flyer ?? null,
            imgSec: d?.imgSec ?? null,

            // desc puede venir con clave distinta
            descripcion: d?.descripcion ?? null,
            desc: d?.desc ?? null,

            generos: d?.generos ?? null,
          };
        };

        snapNew.docs.forEach((doc) => byId.set(doc.id, mapDoc(doc)));
        snapOld.docs.forEach((doc) => byId.set(doc.id, mapDoc(doc)));

        setEventos(Array.from(byId.values()));
      } catch (err) {
        console.error("Error cargando eventos:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid]);

  const now = new Date();

  const { upcoming, past } = useMemo(() => {
    const up: Evento[] = [];
    const pa: Evento[] = [];

    for (const e of eventos) {
      const start = getStartDate(e);
      if (isNaN(start.getTime()) || start <= now) {
        pa.push(e);
      } else {
        up.push(e);
      }
    }

    up.sort((a, b) => getStartDate(a).getTime() - getStartDate(b).getTime());
    pa.sort((a, b) => getStartDate(b).getTime() - getStartDate(a).getTime());

    return { upcoming: up, past: pa };
  }, [eventos]);

  const list = tab === "upcoming" ? upcoming : past;

  if (loading) return <p className="">Cargando eventos...</p>;
  if (eventos.length === 0)
    return <p className="/80">No tienes eventos registrados.</p>;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-white/5 p-1 rounded-lg border /10 w-fit">
        <button
          onClick={() => setTab("upcoming")}
          className={`px-4 py-2 rounded-md text-sm transition ${
            tab === "upcoming" ? "bg-[#8e2afc] " : "/80 hover:"
          }`}
        >
          Próximos ({upcoming.length})
        </button>
        <button
          onClick={() => setTab("past")}
          className={`px-4 py-2 rounded-md text-sm transition ${
            tab === "past" ? "bg-[#8e2afc] " : "/80 hover:"
          }`}
        >
          Realizados ({past.length})
        </button>
      </div>

      <p className="/70 mb-4">
        {tab === "upcoming"
          ? "Eventos posteriores a la fecha/hora actual."
          : "Eventos que ya se realizaron."}
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {list.map((evento) => {
          const generosList = normalizeGeneros(evento.generos);
          const start = getStartDate(evento);
          const fechaLegible = isNaN(start.getTime())
            ? nz(evento.fechaInicio ?? evento.fecha)
            : start.toLocaleString();

          return (
            <div
              key={evento.id_evento}
              className="bg-neutral-900 rounded-lg overflow-hidden border /10 shadow-md hover:shadow-[#8e2afc]/20 transition"
            >
              {evento.flyer ? (
                <img
                  src={evento.flyer}
                  alt={evento.nombre}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 bg-white/10 flex items-center justify-center /40 text-sm">
                  Sin imagen
                </div>
              )}

              <div className="p-4  space-y-2">
                <h3 className="text-lg text-white font-semibold">{evento.nombre}</h3>
                <p className="text-sm /70 text-white ">
                  <span className="font-medium">Tipo:</span> {evento.tipo}
                </p>
                <p className="text-sm /70 text-white">
                  <span className="font-medium">Fecha:</span> {fechaLegible}
                </p>

                {getDescripcion(evento) && (
                  <p className="text-sm /70 text-white mt-1 line-clamp-2">
                    {getDescripcion(evento)}
                  </p>
                )}

                {generosList.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {generosList.map((g) => (
                      <span
                        key={g}
                        className="text-xs text-white px-2 py-1 rounded bg-[#8e2afc]/20 text-[#cbb3ff] border border-[#8e2afc]/30"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-3">
                  <Link
                    to={`/mis-eventos/${evento.id_evento}`}
                    className="inline-flex items-center text-white justify-center px-3 py-2 rounded-md bg-[#8e2afc] hover:bg-[#7b1fe0] text-sm"
                  >
                    Ir a mi evento
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {list.length === 0 && (
        <div className="/70 mt-6">
          {tab === "upcoming"
            ? "No tienes eventos próximos."
            : "No tienes eventos realizados."}
        </div>
      )}
    </div>
  );
}