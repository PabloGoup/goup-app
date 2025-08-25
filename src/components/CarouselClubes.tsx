// src/components/CarouselClubes.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useNavigate } from "react-router-dom";

type ClubData = { id: string; nombre: string; imagen?: string | null };

export default function CarouselClubes() {
  const [clubes, setClubes] = useState<ClubData[]>([]);
  const navigate = useNavigate();

  // Cargar clubes
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "club"));
      const list: ClubData[] = snap.docs.map((d) => ({
        id: d.id,
        nombre: (d.data() as any)?.nombre ?? "Club",
        imagen: (d.data() as any)?.imagen ?? null,
      }));
      setClubes(list);
    })();
  }, []);

  // Duplicamos para loop perfecto
  const row = useMemo(() => clubes, [clubes]);
  const doubled = useMemo(() => (row.length ? [...row, ...row] : []), [row]);

  // ------- Scroll continuo por transform -------
  const trackRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);      // px avanzados
  const lastTsRef = useRef(0);   // timestamp del frame anterior
  const rowWRef = useRef(0);     // ancho de UNA fila (la mitad del track)
  const rafRef = useRef<number | null>(null);

  const measureRowWidth = () => {
    const el = trackRef.current;
    if (!el) return;
    // el.scrollWidth es el total de las dos filas (duplicadas)
    rowWRef.current = el.scrollWidth / 2;
  };

  // Re-medir en cambios y en resize (sin optional chaining tras new)
  useEffect(() => {
    measureRowWidth();

    // Detectar ResizeObserver de forma segura
    const ResizeObsCtor: any = (window as any).ResizeObserver;
    let ro: any = null;
    if (ResizeObsCtor) {
      ro = new ResizeObsCtor(() => measureRowWidth());
      if (trackRef.current) ro.observe(trackRef.current);
    }

    const onResize = () => measureRowWidth();
    window.addEventListener("resize", onResize);

    return () => {
      if (ro && trackRef.current) {
        try { ro.unobserve(trackRef.current); } catch {}
        try { ro.disconnect(); } catch {}
      }
      window.removeEventListener("resize", onResize);
    };
  }, [doubled.length]);

  // Animación (no se pausa en hover)
  useEffect(() => {
    const track = trackRef.current;
    if (!track || doubled.length === 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const SPEED = 26; // px/seg

    const tick = (ts: number) => {
      const last = lastTsRef.current || ts;
      const dt = (ts - last) / 1000;
      lastTsRef.current = ts;

      let pos = posRef.current + SPEED * dt;
      const rowW = rowWRef.current || 1;
      if (pos >= rowW) pos -= rowW; // loop perfecto

      posRef.current = pos;
      track.style.transform = `translateX(${-pos}px)`;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = 0;
    };
  }, [doubled.length]);

  const go = (id: string) => {
    localStorage.setItem("adminSelectedClubId", id);
    navigate("/miClub");
  };

  if (doubled.length === 0) return null;

  return (
    // FULL-BLEED real (borde a borde)
    <div className="relative w-screen left-1/2 -translate-x-1/2">
      <div className="overflow-hidden">
        {/* Track: dos filas pegadas; se mueve con translateX */}
        <div
          ref={trackRef}
          className="flex items-start gap-4 py-4 will-change-transform"
          style={{ transform: "translateX(0px)" }}
        >
          {[0, 1].map((k) => (
            <div key={k} className="flex items-start gap-4">
              {row.map((c) => (
                <button
                  key={`${k}-${c.id}`}
                  onClick={() => go(c.id)}
                  className="
                    group relative flex-none
                    w-[150px] h-[150px] md:w-[164px] md:h-[164px] lg:w-[176px] lg:h-[176px]
                    overflow-visible
                  "
                  aria-label={c.nombre}
                >
                  {/* Glow neón difuminado detrás */}
                  <span
                    className="
                      pointer-events-none
                      absolute -inset-5 rounded-3xl
                      opacity-0 group-hover:opacity-100
                      blur-2xl transition
                    "
                    style={{
                      background:
                        "radial-gradient(120px 90px at 50% 55%, rgba(142,42,252,0.45), transparent 60%)",
                    }}
                  />
                  {/* Tarjeta cuadrada */}
                  <div
                    className="
                      relative w-full h-full rounded-2xl overflow-hidden
                      ring-1 ring-white/10 bg-[#0f0f13]
                      shadow-[0_0_0_0_rgba(142,42,252,0)]
                      group-hover:shadow-[0_18px_42px_-12px_rgba(142,42,252,0.35)]
                      transition
                    "
                  >
                    <img
                      src={c.imagen || "https://placehold.co/600x600/0f0f13/ffffff?text=Club"}
                      alt={c.nombre}
                      className="
                        absolute inset-0 w-full h-full object-cover
                        [filter:contrast(1.06)_saturate(1.08)]
                        transition-transform duration-300
                        group-hover:scale-[1.02]
                      "
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-x-0 bottom-0 text-white bg-black/35 backdrop-blur-md border-t /10 px-2.5 py-1.5">
                      <p className="text-[13px] font-medium  truncate">
                        {c.nombre}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}