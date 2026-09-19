import { create } from "zustand";

interface PosState {
  activeTableId: string | null;
  setActiveTable: (id: string | null) => void;
}

const KEY = "nubepos-active-table";

function initial(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Which table the Pedido screen is currently working on. Persisted so a reload keeps context. */
export const usePos = create<PosState>((set) => ({
  activeTableId: initial(),
  setActiveTable: (id) => {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ activeTableId: id });
  },
}));
