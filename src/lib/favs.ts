// src/lib/favs.ts
export type FavKind = "club" | "event" | "artist";

const PREFIX = "fav";
export const FAV_EVENT = "fav:changed"; // evento custom para el mismo tab

export const favKey = (kind: FavKind, id: string) => `${PREFIX}:${kind}:${id}`;

export const isFav = (kind: FavKind, id: string) => {
  try {
    return localStorage.getItem(favKey(kind, id)) === "1";
  } catch {
    return false;
  }
};

export const setFav = (kind: FavKind, id: string, value: boolean) => {
  const key = favKey(kind, id);
  try {
    if (value) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {}

  // Notificar este MISMO tab (si Safari no deja StorageEvent, usamos CustomEvent)
  try {
    window.dispatchEvent(new CustomEvent(FAV_EVENT, { detail: { kind, id, value } }));
  } catch {}

  // Notificar a OTROS tabs (algunos navegadores permiten construir StorageEvent, otros no)
  try {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value ? "1" : null }));
  } catch {
    // Fallback: “ping” para disparar 'storage' en otros tabs
    try {
      localStorage.setItem("__fav_ping__", String(Date.now()));
    } catch {}
  }
};

export const toggleFav = (kind: FavKind, id: string) => {
  const v = !isFav(kind, id);
  setFav(kind, id, v);
  return v;
};

export const listFavIds = (kind: FavKind): string[] => {
  const out: string[] = [];
  try {
    const prefix = `${PREFIX}:${kind}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith(prefix) && localStorage.getItem(k) === "1") {
        out.push(k.slice(prefix.length));
      }
    }
  } catch {}
  return out;
};