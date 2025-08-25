import { useEffect, useState } from "react";
import {
  collection, getDocs, limit, orderBy, query, startAt, endAt
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Club = { id: string; nombre: string; ciudad?: string; pais?: string };

export default function VenueSelect({
  value, onChange, onCreateNew,
}: {
  value?: string;
  onChange: (clubId: string) => void;
  onCreateNew: () => void;
}) {
  const [term, setTerm] = useState("");
  const [res, setRes] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!term) { setRes([]); return; }
    let alive = true;
    setLoading(true);
    const col = collection(db, "club");
    const qy = query(
      col,
      orderBy("nombre_insensitive"),
      startAt(term.toLowerCase()),
      endAt(term.toLowerCase() + "\uf8ff"),
      limit(10)
    );
    getDocs(qy).then(snap => {
      if (!alive) return;
      setRes(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    }).finally(()=> setLoading(false));
    return () => { alive = false; };
  }, [term]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Localidad *</label>
      <input
        value={term}
        onChange={(e)=>setTerm(e.target.value)}
        placeholder="Busca un club…"
        className="w-full rounded-md bg-white/5 border /10 px-3 py-2"
      />
      {loading && <div className="text-xs /60">Buscando…</div>}
      {!!res.length && (
        <ul className="bg-black/70 border /10 rounded-md max-h-56 overflow-auto">
          {res.map(c=>(
            <li key={c.id}>
              <button
                type="button"
                onClick={()=> onChange(c.id)}
                className="w-full text-left px-3 py-2 hover:bg-white/5"
              >
                <div className="font-medium">{c.nombre}</div>
                <div className="text-xs /60">
                  {[c.ciudad, c.pais].filter(Boolean).join(", ")}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="text-[#8e2afc] text-sm" onClick={onCreateNew}>
        + Nueva localidad
      </button>
    </div>
  );
}