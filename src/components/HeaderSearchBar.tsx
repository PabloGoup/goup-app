// src/components/HeaderSearchBar.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Club = { id: string; nombre: string };

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return <>{text}</>;
  const a = text.slice(0, i);
  const b = text.slice(i, i + query.length);
  const c = text.slice(i + query.length);
  return (
    <>
      {a}
      <span className="text-[#8e2afc] font-bold">{b}</span>
      {c}
    </>
  );
}

export default function HeaderSearchBar({
  className = "",
  variant = "desktop",
}: {
  className?: string;
  variant?: "desktop" | "mobile";
}) {
  const [query, setQuery] = useState("");
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [suggestions, setSuggestions] = useState<Club[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tamaños / z-index por variante
  const boxW   = variant === "mobile" ? "w-full max-w-[240px]" : "w-[250px] md:w-[400px]";
  const inputH = variant === "mobile" ? "h-9" : "h-10";
  const zRoot  = variant === "mobile" ? "z-10" : "z-30";        // móvil debajo del botón Menú
  const zDrop  = variant === "mobile" ? "z-30" : "z-50";

  // Cargar clubes
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "club"));
      const data = snap.docs.map((d) => ({ id: d.id, nombre: d.data().nombre as string }));
      setAllClubs(data);
    })();
  }, []);

  // Cerrar al click fuera
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const recompute = (v: string) => {
    const q = v.trim().toLowerCase();
    if (!q) {
      // lista aleatoria corta
      setSuggestions([...allClubs].sort(() => 0.5 - Math.random()).slice(0, 8));
    } else {
      setSuggestions(allClubs.filter((c) => c.nombre.toLowerCase().includes(q)).slice(0, 8));
    }
    setActive(-1);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    recompute(v);
  };

  const onFocus = () => {
    setOpen(true);
    recompute(query);
  };

  const select = (id: string) => {
    localStorage.setItem("adminSelectedClubId", id);
    navigate("/club");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setActive((p) => (p + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setActive((p) => (p - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && suggestions[active]) select(suggestions[active].id);
      else {
        // si no hay selección, ir a /clubes
        setOpen(false);
        navigate("/clubes");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className={`relative ${zRoot} ${className}`}>
      {/* INPUT */}
      <div
        className={`flex items-center gap-2 ${inputH} ${boxW}
                    rounded-full border border-white/15 bg-white/5 backdrop-blur
                    pl-3 pr-3 focus-within:ring-2 focus-within:ring-[#8e2afc]/60`}
      >
        {/* lupa */}
        <svg viewBox="0 0 24 24" className="w-4 h-4 opacity-80" fill="none" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"
          />
        </svg>

        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar tu club..."
          className={`flex-1 bg-transparent outline-none ${
            variant === "mobile" ? "text-[13px]" : "text-sm"
          } placeholder:text-white/70`}
          value={query}
          onChange={onChange}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              recompute("");
              inputRef.current?.focus();
            }}
            className="text-white/70 hover:text-white"
            aria-label="Limpiar búsqueda"
          >
            ×
          </button>
        )}
      </div>

      {/* DROPDOWN con CTA */}
      {open && (
        <div className={`absolute left-0 top-[calc(100%+6px)] ${boxW} ${zDrop}`}>
          <ul
            role="listbox"
            className="rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl
                       max-h-64 overflow-y-auto divide-y divide-white/10"
          >
            {suggestions.length > 0 ? (
              <>
                {suggestions.map((club, idx) => (
                  <li key={club.id} role="option" aria-selected={idx === active}>
                    <button
                      type="button"
                      onClick={() => select(club.id)}
                      className={`w-full px-3 py-2.5 text-left text-[14px] ${
                        idx === active ? "bg-white/10" : "hover:bg-white/5"
                      }`}
                    >
                      <Highlight text={club.nombre} query={query} />
                    </button>
                  </li>
                ))}
                {/* CTA final */}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate("/clubes");
                    }}
                    className="w-full px-3 py-2.5 text-left text-[14px] font-semibold text-[#b688ff] hover:bg-white/5"
                  >
                    Ver todos los clubes →
                  </button>
                </li>
              </>
            ) : (
              <>
                <li className="px-3 py-3 text-[14px] text-white/80">Sin resultados.</li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate("/clubes");
                    }}
                    className="w-full px-3 py-2.5 text-left text-[14px] font-semibold text-[#b688ff] hover:bg-white/5"
                  >
                    Ver todos los clubes →
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}