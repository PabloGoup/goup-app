import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Convierte la URL del avatar a un ObjectURL (blob) y lo mantiene en memoria
 * durante la sesión. También guarda una banderita "loaded" en sessionStorage
 * para que el <img> haga fade-in solo la primera vez que cargue en esa sesión.
 */

const objectUrlCache = new Map<string, string>(); // liveUrl -> objectURL

export function useAvatarObjectURL(userId?: string, liveUrl?: string) {
  const storageKey = useMemo(
    () => (userId ? `goup:avatar:loaded:${userId}` : null),
    [userId]
  );

  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<boolean>(() => {
    if (!storageKey) return false;
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const lastLiveRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!liveUrl) {
      setSrc(null);
      lastLiveRef.current = undefined;
      return;
    }
    if (liveUrl === lastLiveRef.current && src) return;
    lastLiveRef.current = liveUrl;

    // ¿ya tenemos ObjectURL en memoria?
    const cached = objectUrlCache.get(liveUrl);
    if (cached) {
      setSrc(cached);
      return;
    }

    let cancelled = false;
    // Descargamos como blob y generamos ObjectURL
    fetch(liveUrl, { cache: "force-cache" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrlCache.set(liveUrl, url);
        setSrc(url);
      })
      .catch(() => {
        // Fallback: usa la URL original si falla el fetch como blob
        if (!cancelled) setSrc(liveUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [liveUrl]);

  const markLoaded = () => {
    if (storageKey) {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {}
    }
    setLoaded(true);
  };

  return { src, loaded, markLoaded };
}