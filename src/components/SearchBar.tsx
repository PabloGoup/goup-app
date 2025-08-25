import { useEffect, useState, useRef } from "react";
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
      <span className="text-primary font-bold">{b}</span>
      {c}
    </>
  );
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Club[]>([]);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number>(-1);

  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar clubes
  useEffect(() => {
    (async () => {
      const snapshot = await getDocs(collection(db, "club"));
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        nombre: doc.data().nombre as string,
      }));
      setAllClubs(data);
    })();
  }, []);

  // Cerrar al hacer click fuera
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const recompute = (value: string) => {
    if (!value.trim()) {
      setSuggestions([...allClubs].sort(() => 0.5 - Math.random()).slice(0, 10));
    } else {
      setSuggestions(
        allClubs
          .filter((c) => c.nombre.toLowerCase().includes(value.toLowerCase()))
          .slice(0, 10)
      );
    }
    setActive(-1);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setOpen(true);
    recompute(value);
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
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((p) => (p + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((p) => (p - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) select(suggestions[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="w-full mt-4 z-20">
      {/* contenedor relativo: input + dropdown tendrán el mismo ancho */}
      <div ref={boxRef} className="relative w-full max-w-3xl mx-auto">
        {/* INPUT */}
        <div className="flex items-center gap-2 rounded-full bg-white/[0.06] border /10 px-4 h-12">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="w-5 h-5 /80"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Busca tu club de preferencia"
            className="bg-transparent  outline-none placeholder:/60 flex-1"
            value={query}
            onChange={onChange}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
          />
        </div>

        {/* DROPDOWN */}
        {open && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30">
            <ul
              className="
                rounded-xl border /10 bg-black/85 backdrop-blur-md shadow-xl
                max-h-64 overflow-y-auto divide-y divide-white/10
              "
              role="listbox"
            >
              {suggestions.map((club, idx) => (
                <li key={club.id} role="option" aria-selected={idx === active}>
                  <button
                    type="button"
                    onClick={() => select(club.id)}
                    className={`
                      w-full px-4 py-2.5 text-left text-white
                      font-headline font-semibold text-[15px] leading-6
                      /90 hover:bg-white/[0.06] focus:bg-white/[0.08]
                      outline-none transition
                      ${idx === active ? "bg-white/[0.08]" : ""}
                    `}
                  >
                    <Highlight text={club.nombre} query={query} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}