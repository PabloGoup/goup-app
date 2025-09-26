// src/pages/HeroVideo.tsx
/*<div className="flex gap-3 pt-1">
<a
  className="inline-flex items-center justify-center rounded-md border border-white/20 hover:bg-white/10 px-5 py-2.5 font-semibold"
  href="/clubes"
>
  Clubes
</a>
<a
  className="inline-flex items-center justify-center rounded-md border border-white/20 hover:bg-white/10 px-5 py-2.5 font-semibold"
  href="/eventos"
>
  Eventos
</a>
</div>
*/
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

type Slide = { src: string; alt: string; kind?: "photo" | "logo"; pos?: string };

const SLIDES: Slide[] = [
    { src: "/media/hero/imagen1.png", alt: "Manos bailando con luces neón moradas" },
    { src: "/media/hero/imagen2.png", alt: "Gente bailando en un club con humo y neón"},
    { src: "/media/hero/imagen3.png", alt: "DJ en cabina con luces moradas" },
    { src: "/media/hero/imagen4.png", alt: "Luces láser y bokeh en la pista" },
    // 👇 Logo: no se recorta, se centra y se rellena con gradiente
    { src: "/media/hero/imagen5.png", alt: "Gráfica del logo GoUp con U morada"},
  ];

const DURATION_MS = 2000; // 10s total / 5 imágenes
const FADE_S = 0.6;

export default function HeroVideo() {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), DURATION_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  const current = SLIDES[index];
  const isLogo = current.kind === "logo";

  return (
    <section
      className="
        relative max-w-6xl mx-auto px-4 md:px-6 py-16
        grid md:grid-cols-[1.1fr,1fr] gap-10 items-center
      "
    >
      {/* Copy */}
      <div className="space-y-5">
        <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight leading-tight">
          Vive la noche sin fricción
        </h1>
        <p className="text-lg lg:text-xl text-white/80 max-w-xl">
          Entradas claras, acceso sin filas y planes al toque.
        </p>
     
      </div>

      {/* Slider: card más ancha y un poco más corta, pegado a la derecha */}
      <figure
        className="
          relative ml-auto justify-self-end
          w-full max-w-[500px] lg:max-w-[500px]
          aspect-[5/5] lg:aspect-[5/5]
           overflow-hidden hadow-2xl
        "
      >
        <AnimatePresence mode="wait">
          {isLogo ? (
            // Modo LOGO: nunca se recorta, centrado y con fondo gradiente
            <motion.div
              key={current.src}
              className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#25123e] via-[#381a63] to-[#FE8B02]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: FADE_S, ease: [0.2, 0, 0, 1] }}
            >
              <img
                src={current.src}
                alt={current.alt}
                className="max-h-[90%] max-w-[90%] object-contain"
                loading="eager"
                decoding="async"
              />
            </motion.div>
          ) : (
            // Modo FOTO: cover + foco por slide
            <motion.img
              key={current.src}
              src={current.src}
              alt={current.alt}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: current.pos || "center" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: FADE_S, ease: [0.2, 0, 0, 1] }}
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          )}
        </AnimatePresence>

        {/* Indicadores */}
        <div className="absolute bottom-4 right-4 flex gap-1.5" aria-label="Indicadores de slide">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-white/90" : "w-2 bg-white/40"
              }`}
            />
          ))}
        </div>
      </figure>
    </section>
  );
}