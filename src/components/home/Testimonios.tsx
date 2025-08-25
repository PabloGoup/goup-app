export default function Testimonios() {
    const items = [
      { q: "Compré en 30 segundos y entré directo.", a: "Camila" },
      { q: "Por fin sin filas. Todo claro.", a: "Joaquín" },
      { q: "Me recomendó fiestas que sí me gustan.", a: "Anto" },
    ];
    return (
      <div className="panel">
        <h3 className="text-xl font-bold text-[#8e2afc] mb-4">Loved by raverxs</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {items.map((t) => (
            <blockquote key={t.q} className="rounded-md bg-white/5 border border-white/10 p-4">
              <p className="italic text-white/90">“{t.q}”</p>
              <footer className="text-white/60 text-sm mt-2">— {t.a}</footer>
            </blockquote>
          ))}
        </div>
      </div>
    );
  }