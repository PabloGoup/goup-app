export default function Beneficios() {
    const items = [
      { t: "Compra rápida", d: "Entra en segundos con pago simple y seguro." },
      { t: "Beneficios por utilizar", d: "Tu membresia irá creciendo a medida que la uses." },
      { t: "Recomendaciones reales", d: "Descubre fiestas según tus gustos." },
    ];
    return (
      <div className="grid md:grid-cols-3 gap-4">
        {items.map((it) => (
          <div key={it.t} className="panel">
            <h3 className="text-lg font-bold text-[#cbb3ff] mb-2">{it.t}</h3>
            <p className="text-white/80">{it.d}</p>
          </div>
        ))}
      </div>
    );
  }