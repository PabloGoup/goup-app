import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, startAt, endAt } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";

type Item = { id: string; nombre: string; ciudad?: string; pais?: string };

export default function VenueAutocomplete({
  value,
  onChange,
  onNewVenue,
  label = "Localidad",
  placeholder = "Busca un club por nombre...",
  minChars = 2,
}: {
  value?: string;
  onChange: (id: string) => void;
  onNewVenue?: () => void;
  label?: string;
  placeholder?: string;
  minChars?: number;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  const showList = open && (term.length >= minChars || items.length > 0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (term.trim().length < minChars) {
        if (alive) setItems([]);
        return;
      }
      setLoading(true);
      try {
        // Colección correcta: "club" (como en la creación de club)
        const col = collection(firebaseDb, "club");
        const q = query(
          col,
          orderBy("nombre"),
          startAt(term),
          endAt(term + "\uf8ff"),
          limit(10)
        );
        const snap = await getDocs(q);
        if (!alive) return;
        const list: Item[] = snap.docs.map((d) => {
          const data: any = d.data();
          return {
            id: d.id,
            nombre: data?.nombre ?? "(sin nombre)",
            ciudad: data?.ciudad ?? "",
            pais: data?.pais ?? "",
          };
        });
        setItems(list);
      } catch (e) {
        console.error("VenueAutocomplete query error:", e);
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    const t = setTimeout(run, 250); // debounce chico para reducir requests/costos
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, minChars]);

  const selectedLabel = useMemo(() => {
    const found = items.find((i) => i.id === value);
    return found ? `${found.nombre}${found.ciudad ? ` — ${found.ciudad}` : ""}` : "";
  }, [items, value]);

  return (
    <div className="space-y-1 relative">
      <label className="block text-sm text-white/70">{label}</label>
      <div
        className="input w-full cursor-text"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        <input
          className="bg-transparent outline-none w-full"
          placeholder={placeholder}
          value={open ? term : selectedLabel}
          onChange={(e) => setTerm(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>

      {showList && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-white/10 bg-neutral-900 shadow-xl max-h-64 overflow-auto">
          {loading && <div className="px-3 py-2 text-sm text-white/60">Buscando…</div>}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-white/60">Sin resultados</div>
          )}
          {!loading &&
            items.map((it) => (
              <button
                type="button"
                key={it.id}
                className="w-full text-left px-3 py-2 hover:bg-white/5"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(it.id);
                  setTerm("");
                  setOpen(false);
                }}
              >
                <div className="text-sm">{it.nombre}</div>
                <div className="text-xs text-white/50">
                  {[it.ciudad, it.pais].filter(Boolean).join(", ")}
                </div>
              </button>
            ))}
          {onNewVenue && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-[#cbb3ff] hover:bg-white/5 border-t border-white/10"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onNewVenue();
              }}
            >
              + Nueva localidad
            </button>
          )}
        </div>
      )}
    </div>
  );
}