// src/components/ThemeToggle.tsx
import { useEffect, useState } from "react";
import { applyTheme, getSavedTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle() {
  // Si estaba guardado "system", fuerza un valor por defecto (dark o light).
  const saved = getSavedTheme();
  const [theme, setTheme] = useState<Theme>(saved === "system" ? "dark" : saved);
  const isDark = document.documentElement.classList.contains('dark');
const next = isDark ? 'light' : 'dark';
document.documentElement.classList.toggle('dark', next === 'dark');
localStorage.setItem('theme', next);

  useEffect(() => {
    applyTheme(theme); // guarda y aplica "light" | "dark"
  }, [theme]);

  return (
    <div className="inline-flex items-center gap-1 rounded-xl p-1 bg-card border border-border">
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        title="Tema claro"
        className={`px-2.5 py-1 rounded-lg text-sm transition-colors
          ${theme === "light"
            ? "bg-primary/20 text-foreground"
            : "text-muted-foreground hover:bg-secondary/80"}`}
      >
        ☀️
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        title="Tema oscuro"
        className={`px-2.5 py-1 rounded-lg text-sm transition-colors
          ${theme === "dark"
            ? "bg-primary/20 text-foreground"
            : "text-muted-foreground hover:bg-secondary/80"}`}
      >
        🌙
      </button>
    </div>
  );
}