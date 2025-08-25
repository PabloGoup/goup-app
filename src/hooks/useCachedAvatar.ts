// src/hooks/useCachedAvatar.ts
import { useEffect, useMemo, useState } from "react";

export function useCachedAvatar(userId?: string, urlFromDb?: string | null) {
  const key = useMemo(() => (userId ? `goup:avatar:${userId}` : null), [userId]);

  // lee primero de localStorage para que aparezca instantáneo
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!key) return urlFromDb || undefined;
    return (localStorage.getItem(key) || urlFromDb || undefined) as string | undefined;
  });

  // si en algún momento llega una URL “nueva” desde la DB, actualiza cache y estado
  useEffect(() => {
    if (!key) return;
    if (urlFromDb && urlFromDb !== localStorage.getItem(key)) {
      localStorage.setItem(key, urlFromDb);
      setUrl(urlFromDb);
    }
  }, [key, urlFromDb]);

  return url;
}