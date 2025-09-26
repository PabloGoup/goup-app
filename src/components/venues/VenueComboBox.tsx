// src/components/venues/VenueComboBox.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Firestore,
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";

type ClubOption = { id: string; nombre: string };

export default function VenueComboBox({
  value,
  onChange,
  onNewVenue,
  label = "Localidad (Club) *",
  placeholder = "Buscar un club por nombre…",
  
}: {
  value: string;
  onChange: (id: string) => void;
  onNewVenue: () => void;
  label?: string;
  placeholder?: string;
}) {
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [queryText, setQueryText] = useState("");
  const [open, setOpen] = useState(false);
  const [popRect, setPopRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Cargar clubs
  useEffect(() => {
    (async () => {
      const qRef = query(
        collection(firebaseDb as Firestore, "club"),
        orderBy("nombre")
      );
      const snap = await getDocs(qRef);
      setClubs(
        snap.docs.map((d) => ({
          id: d.id,
          nombre: (d.data() as any).nombre || "(Sin nombre)",
        }))
      );
    })();
  }, []);

  // Cerrar al hacer click fuera (pero no cuando selecciono una opción)
  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        !inputRef.current?.contains(t) &&
        !popoverRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("pointerdown", onDocPointerDown);
    }
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onWin = () => updateRect();
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("resize", onWin);
    return () => {
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("resize", onWin);
    };
  }, [open]);

  // Texto mostrado en el input: si no hay filtro, mostrar el nombre del seleccionado
  const selected = useMemo(
    () => clubs.find((c) => c.id === value) || null,
    [clubs, value]
  );
  const inputValue = open ? queryText : selected?.nombre ?? "";

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter((c) => c.nombre.toLowerCase().includes(q));
  }, [clubs, queryText]);

  const handleSelect = (opt: ClubOption) => {
    onChange(opt.id);
    setQueryText("");
    setOpen(false);
    // Mantener el foco para evitar saltos de viewport en móvil
    inputRef.current?.focus({ preventScroll: true });
  };

  // Handlers para móvil/desktop:
  // - pointerdown/touchstart/mousedown → prevenimos blur y seleccionamos
  const selectEvents = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault(); // evita blur antes del "click" en móvil
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
    },
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
    },
  };

  function updateRect() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPopRect({ left: r.left, top: r.bottom, width: r.width });
  }

  return (
    <div className="space-y-2">
      <label className="text-sm /70">{label}</label>

      <div className="relative">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            className="w-full bg-white/5  placeholder-white/40 border /10 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FE8B02]"
            placeholder={placeholder}
            value={inputValue}
            onFocus={() => {
              setOpen(true);
              setQueryText(""); // al abrir, habilita búsqueda
              updateRect();
            }}
            onChange={(e) => {
              setQueryText(e.target.value);
              if (!open) setOpen(true);
            }}
            aria-expanded={open}
            aria-haspopup="listbox"
            role="combobox"
            inputMode="search"
            autoComplete="off"
          />
          <button
            type="button"
            className="shrink-0 rounded border /10 px-2 py-2 text-xs /70 hover:bg-white/10"
            onClick={() => onNewVenue()}
          >
            + Nueva localidad
          </button>
        </div>

        {open && popRect &&
          createPortal(
            <div
              ref={popoverRef}
              className="fixed z-[9999] rounded-lg border /10 bg-neutral-900/95 backdrop-blur-sm shadow-lg max-h-64 overflow-auto"
              role="listbox"
              style={{ left: popRect.left, top: popRect.top, width: popRect.width }}
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm /60 flex items-center justify-between">
                  <span>Sin resultados</span>
                  <button
                    type="button"
                    className="text-[#cbb3ff] hover:underline"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={onNewVenue}
                  >
                    + Nueva localidad
                  </button>
                </div>
              ) : (
                <>
                  {filtered.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${
                        opt.id === value ? "bg-white/5" : ""
                      }`}
                      {...selectEvents}
                      onClick={() => handleSelect(opt)}
                      role="option"
                      aria-selected={opt.id === value}
                    >
                      {opt.nombre}
                    </button>
                  ))}
                  <div className="border-t /10" />
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm text-[#cbb3ff] hover:bg-white/10"
                    {...selectEvents}
                    onClick={onNewVenue}
                  >
                    + Nueva localidad
                  </button>
                </>
              )}
            </div>,
            document.body
          )
        }
      </div>
    </div>
  );
}