// src/components/venues/VenueComboBox.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Firestore, collection, getDocs, orderBy, query } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";

type Club = { id: string; nombre: string };

export default function VenueComboBox({
  value,
  onChange,
  onNewVenue,
  label = "Localidad (Club) *",
}: {
  value: string;
  onChange: (id: string) => void;
  onNewVenue?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [everClicked, setEverClicked] = useState(false); // ← clave: no abrir si nunca se clicó
  const [qtext, setQtext] = useState("");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedName, setSelectedName] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closingRef = useRef(false);

  useEffect(() => { setOpen(false); }, []); // nunca abierto al montar

  useEffect(() => {
    (async () => {
      const qs = query(collection(firebaseDb as Firestore, "club"), orderBy("nombre"));
      const snap = await getDocs(qs);
      setClubs(snap.docs.map(d => ({ id: d.id, nombre: String(d.data().nombre || "") })));
    })();
  }, []);

  useEffect(() => {
    setSelectedName(clubs.find(c => c.id === value)?.nombre ?? "");
  }, [value, clubs]);

  const filtered = useMemo(() => {
    const t = qtext.trim().toLowerCase();
    return t ? clubs.filter(c => c.nombre.toLowerCase().includes(t)) : clubs;
  }, [qtext, clubs]);

  useEffect(() => {
    const onDocPointerDown = (ev: PointerEvent) => {
      if (!open) return;
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDocPointerDown, { capture: true });
  }, [open]);

  const selectClub = (id: string) => {
    closingRef.current = true;
    setOpen(false);
    requestAnimationFrame(() => {
      onChange(id);
      closingRef.current = false;
      setQtext("");
      inputRef.current?.blur();
    });
  };

  const handleTriggerClick = () => {
    if (closingRef.current) return;
    setEverClicked(true);
    setOpen(o => !o);
    if (!open) requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div ref={rootRef} className="relative">
      <label className="block mb-1 text-sm text-white/70">{label}</label>

      <button
        type="button"
        className="w-full rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-white hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-[#8e2afc]"
        onClick={handleTriggerClick}
      >
        {selectedName || <span className="text-white/40">Buscar un club por nombre…</span>}
      </button>

      {open && everClicked && (
        <div className="absolute z-40 mt-2 w-full rounded-lg border border-white/10 bg-[#0b0b0d] shadow-xl">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={qtext}
              onChange={(e) => setQtext(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded bg-white/[0.06] px-3 py-2 text-white placeholder-white/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#8e2afc]"
              onBlur={() => setTimeout(() => {
                if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
              }, 0)}
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
            />
          </div>

          <ul className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-white/50">Sin resultados</li>
            )}
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-white/[0.06]"
                  onPointerDown={(e) => { e.preventDefault(); selectClub(c.id); }}
                >
                  {c.nombre}
                </button>
              </li>
            ))}
            <li className="border-t border-white/10 mt-1">
              <button
                type="button"
                className="block w-full text-left px-3 py-2 text-sm text-[#cbb3ff] hover:bg-white/[0.06]"
                onPointerDown={(e) => { e.preventDefault(); setOpen(false); onNewVenue?.(); }}
              >
                + Nueva localidad
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}