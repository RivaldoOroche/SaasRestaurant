import { create } from "zustand";

/**
 * Estado del tour de bienvenida (onboarding in-app). Se muestra una vez por rol
 * en cada navegador; el usuario puede reabrirlo desde el Centro de ayuda.
 */
interface TourState {
  open: boolean;
  start: () => void;
  close: () => void;
  /** Marca el tour como visto para este rol y lo cierra. */
  finish: (role: string) => void;
  /** Devuelve true si el tour aún no se vio para este rol (primer ingreso). */
  shouldAutoStart: (role: string) => boolean;
}

const KEY = "wayra-tour-seen"; // JSON: { [role]: true }

function seenMap(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export const useTour = create<TourState>((set) => ({
  open: false,
  start: () => set({ open: true }),
  close: () => set({ open: false }),
  finish: (role) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...seenMap(), [role]: true }));
    } catch {
      /* ignore */
    }
    set({ open: false });
  },
  shouldAutoStart: (role) => {
    try {
      return !seenMap()[role];
    } catch {
      return false;
    }
  },
}));
