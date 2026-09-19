import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  apply: () => void;
}

const KEY = "nubepos-theme";

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY) as Theme | null;
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* ignore */
  }
  return "dark"; // Nocturne is dark-first
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initial(),
  toggle: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("data-theme", next);
    set({ theme: next });
  },
  apply: () => {
    document.documentElement.setAttribute("data-theme", get().theme);
  },
}));
