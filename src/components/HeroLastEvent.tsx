// src/components/HeroLastEvent.tsx
import { useEffect, useMemo, useState } from "react";
import {
  getDocs,
  collection,
  doc,
  getDoc,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useNavigate } from "react-router-dom";

/* ======================= Tipos ======================= */
type EventDoc = {
  nombre: string;
  flyer?: string | null;
  clubId?: string;
};
type EventData = {
  id: string;
  nombre: string;
  flyer?: string | null;
  clubId?: string;
};
type ClubDoc = {
  nombre: string;
  ciudad?: string | null;
  direccion?: string | null;
  pais?: string | null;
};
type ClubMap = Record<
  string,
  { nombre: string; ciudad?: string | null; direccion?: string | null; pais?: string | null }
>;

/* ======================= Componente ======================= */
export default function HeroLastEvent() {
  const [eventos, setEventos] = useState<EventData[]>([]);
  const [clubes, setClubes] = useState<ClubMap>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const navigate = useNavigate();

  // Cargar eventos + clubes
  useEffect(() => {
    (async () => {
      try {
        const snap: QuerySnapshot<DocumentData> = await getDocs(collection(db, "evento"));
        const eventosData: EventData[] = snap.docs.map((d) => {
          const data = d.data() as EventDoc;
          return {
            id: d.id,
            nombre: data?.nombre ?? "Evento",
            flyer: data?.flyer ?? null,
            clubId: data?.clubId,
          };
        });

        setEventos(eventosData);

        const uniqueClubIds = [
          ...new Set(eventosData.map((e) => e.clubId).filter(Boolean) as string[]),
        ];

        if (uniqueClubIds.length === 0) return;

        const fetched = await Promise.all(
          uniqueClubIds.map(async (cid) => {
            try {
              const ref = doc(db, "club", cid);
              const s = await getDoc(ref);
              if (!s.exists()) return null;
              const c = s.data() as ClubDoc;
              return {
                id: cid,
                nombre: c?.nombre ?? "Club",
                ciudad: c?.ciudad ?? null,
                direccion: c?.direccion ?? null,
                pais: c?.pais ?? null,
              };
            } catch {
              return null;
            }
          })
        );

        const map: ClubMap = {};
        fetched.forEach((c) => {
          if (c) map[c.id] = { nombre: c.nombre, ciudad: c.ciudad, direccion: c.direccion, pais: c.pais };
        });
        setClubes(map);
      } catch (e) {
        console.error("Error cargando eventos/clubs:", e);
      }
    })();
  }, []);

  // Auto-slide
  useEffect(() => {
    if (eventos.length === 0) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex((i) => (i + 1) % eventos.length);
        setVisible(true);
      }, 400);
    }, 5000);
    return () => clearInterval(id);
  }, [eventos.length]);

  const current = eventos[currentIndex];
  const club = current?.clubId ? clubes[current.clubId] : null;

  const ubicacion = useMemo(() => {
    if (!club) return null;
    const parts = [club.nombre, club.ciudad].filter(Boolean);
    return parts.join(" · ");
  }, [club]);

  if (!current) return null;

  const go = () => navigate(`/mis-eventos/${current.id}`);

  return (
    <section
      className="
        relative w-full 
        h-[42vh] sm:h-[46vh] md:h-[40vh] 
        min-h-[200px] md:min-h-[300px] lg:min-h-[330px]
        max-h-[560px]
        overflow-hidden
      "
    >
      {/* Click en toda la imagen navega al evento */}
      <button
        onClick={go}
        aria-label={`Ver ${current.nombre}`}
        className="absolute inset-0 text-white w-full h-full cursor-pointer"
      >
        {/* Imagen de fondo */}
        <img
          src={current.flyer || "https://placehold.co/1600x600/0f0f13/FFFFFF?text=Evento"}
          alt={current.nombre}
          className={`
            absolute inset-0 w-full h-full object-cover
            [object-position:center_30%]
            transition-opacity duration-500 ease-out
            ${visible ? "opacity-100" : "opacity-0"}
          `}
          decoding="async"
          loading="eager"
        />

        {/* Gradientes para legibilidad */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/55 pointer-events-none" />

        {/* Barra inferior: nombre + ubicación en la MISMA línea (con wrap si falta espacio) */}
        <div
          className="
            absolute inset-x-0 bottom-0
            px-4 sm:px-6 lg:px-10 py-4
            bg-black/20
           
            text-left
          "
        >
          <div className="flex items-end gap-3 flex-wrap">
            <h1 className=" font-extrabold tracking-tight text-1xl sm:text-1xl md:text-2xl leading-none">
              {current.nombre}
            </h1>

            {ubicacion && (
              <div className="flex items-center gap-3 leading-none">
                <span className="/60 text-xl">•</span>
                <span className="/90 text-base sm:text-lg">
                  En {ubicacion}
                </span>
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Flechas navegación */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setVisible(false);
          setTimeout(() => {
            setCurrentIndex((i) => (i - 1 + eventos.length) % eventos.length);
            setVisible(true);
          }, 400);
        }}
        className="
          absolute left-3 sm:left-4 top-1/2 -translate-y-1/2
          bg-black/45 hover:bg-black/65 
          rounded-full w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center
          text-xl z-20 transition
        "
        aria-label="Anterior"
      >
        ‹
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          setVisible(false);
          setTimeout(() => {
            setCurrentIndex((i) => (i + 1) % eventos.length);
            setVisible(true);
          }, 400);
        }}
        className="
          absolute right-3 sm:right-4 top-1/2 -translate-y-1/2
          bg-black/45 hover:bg-black/65 
          rounded-full w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center
          text-xl z-20 transition
        "
        aria-label="Siguiente"
      >
        ›
      </button>
    </section>
  );
}