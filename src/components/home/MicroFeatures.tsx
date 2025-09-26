export default function MicroFeatures() {
    const items = [
      "Invita a tus amigos",
      "Listas y acceso rápido",
      "Acceso a sold out*",
      "Merch y experiencias",
      "Soporte en español",
      "Favoritos y alertas",
    ];
    return (
      <div className="panel">
        <h3 className="text-xl font-bold text-[#FE8B02] mb-3">Más que entradas</h3>
        <div className="flex flex-wrap gap-2">
          {items.map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
        </div>
        <p className="text-xs text-white/50 mt-2">*Seg&uacute;n disponibilidad del productor.</p>
      </div>
    );
  }