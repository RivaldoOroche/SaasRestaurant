import { create } from "zustand";

interface ConnectionState {
  online: boolean;
  toggle: () => void;
  setOnline: (v: boolean) => void;
}

const KEY = "nubepos-online";

function initial(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

/** Simulated connectivity for SUNAT submission (toggled from the rail). */
export const useConnection = create<ConnectionState>((set, get) => ({
  online: initial(),
  toggle: () => get().setOnline(!get().online),
  setOnline: (v) => {
    try {
      localStorage.setItem(KEY, String(v));
    } catch {
      /* ignore */
    }
    set({ online: v });
  },
}));
