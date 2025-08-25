export default function PartnersStrip() {
    const partners = ["Si tienes un club, productora o simplemente te gusta crear Eventos, Hablanos y te ayudaremos"];
    return (
      <div className="panel overflow-hidden">
        <h3 className="text-xl font-bold text-[#8e2afc] mb-3">Aliados & venues</h3>
        <div className="flex gap-6 animate-[scroll_20s_linear_infinite] whitespace-nowrap">
          {partners.map((p) => (
            <span key={p} className="text-white/70">{p}</span>
          ))}
        </div>
        {/* Animación marquee mínima: añade en globals.css
           @keyframes scroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        */}
      </div>
    );
  }