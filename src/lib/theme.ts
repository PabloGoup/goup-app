// src/lib/theme.ts
export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'goup-theme';

export function getSavedTheme(): Theme {
  const t = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
  return t;
}

export function isDark(theme: Theme) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', isDark(theme));
  localStorage.setItem(STORAGE_KEY, theme);
}

export function listenSystemTheme(cb: (dark: boolean) => void) {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => cb(e.matches);

  // Compatibilidad
  // @ts-ignore
  mql.addEventListener ? mql.addEventListener('change', handler) : mql.addListener(handler);

  return () => {
    // @ts-ignore
    mql.removeEventListener ? mql.removeEventListener('change', handler) : mql.removeListener(handler);
  };
}