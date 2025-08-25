// src/hooks/useFav.ts
import { useEffect, useState } from "react";
import { FavKind, favKey, isFav, toggleFav as toggle, FAV_EVENT } from "@/lib/favs";

export function useFav(kind: FavKind, id: string) {
  const [fav, setFav] = useState(() => isFav(kind, id));

  // Si cambian props, sincroniza el estado
  useEffect(() => setFav(isFav(kind, id)), [kind, id]);

  // Reaccionar a cambios: otra pestaña (storage) o mismo tab (CustomEvent)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === favKey(kind, id) || e.key === "__fav_ping__") {
        setFav(isFav(kind, id));
      }
    };
    const onCustom = (e: Event) => {
      const det = (e as CustomEvent).detail || {};
      if (det.kind === kind && det.id === id) setFav(isFav(kind, id));
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(FAV_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FAV_EVENT, onCustom as EventListener);
    };
  }, [kind, id]);

  const toggleFav = () => setFav(toggle(kind, id));
  return { fav, toggleFav };
}