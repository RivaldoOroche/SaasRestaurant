import { create } from "zustand";

interface ConnectionState {
  /** Hay red según el navegador. */
  network: boolean;
  /** "Trabajar sin conexión" forzado (pruebas, demo o red inestable). */
  forcedOffline: boolean;
  /** Conectado de verdad: red y sin modo forzado. */
  online: boolean;
  toggle: () => void;
  setOnline: (v: boolean) => void;
}

const KEY = "nubepos-online";

function forcedInitial(): boolean {
  try {
    return localStorage.getItem(KEY) === "false";
  } catch {
    return false;
  }
}

const netInitial = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

/**
 * Estado de conexión del dispositivo. Sin conexión el POS sigue operando: las
 * acciones se guardan en la cola local y se sincronizan al volver la red.
 */
export const useConnection = create<ConnectionState>((set, get) => {
  const compute = (network: boolean, forcedOffline: boolean) => ({ network, forcedOffline, online: network && !forcedOffline });
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => set(compute(true, get().forcedOffline)));
    window.addEventListener("offline", () => set(compute(false, get().forcedOffline)));
  }
  return {
    ...compute(netInitial(), forcedInitial()),
    toggle: () => get().setOnline(get().forcedOffline),
    setOnline: (v) => {
      try {
        localStorage.setItem(KEY, String(v));
      } catch {
        /* ignore */
      }
      set(compute(get().network, !v));
    },
  };
});

export const isOnlineNow = () => useConnection.getState().online;
