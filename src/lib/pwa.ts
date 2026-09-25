import { create } from "zustand";

/**
 * Estado de la PWA: instalación ("Agregar a inicio") y actualizaciones del
 * service worker. Android/Chrome/Edge exponen `beforeinstallprompt`; iOS no,
 * así que ahí se muestran instrucciones manuales (Compartir → Agregar a inicio).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** Evento diferido del navegador para lanzar el diálogo nativo de instalación. */
  installEvent: BeforeInstallPromptEvent | null;
  /** Hay una versión nueva del SW esperando para activarse. */
  updateReady: boolean;
  installed: boolean;
}

export const usePwa = create<PwaState>(() => ({
  installEvent: null,
  updateReady: false,
  installed: isStandalone(),
}));

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ se identifica como Mac con pantalla táctil.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

let waitingWorker: ServiceWorker | null = null;

function trackWaiting(reg: ServiceWorkerRegistration) {
  const mark = (w: ServiceWorker | null) => {
    // Solo es "actualización" si ya había una versión controlando la página.
    if (w && navigator.serviceWorker.controller) {
      waitingWorker = w;
      usePwa.setState({ updateReady: true });
    }
  };
  mark(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const nw = reg.installing;
    nw?.addEventListener("statechange", () => {
      if (nw.state === "installed") mark(nw);
    });
  });
}

/** Registra el SW y engancha los eventos de instalación/actualización. */
export function initPwa(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // mostramos nuestro propio botón
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => {
    usePwa.setState({ installed: true, installEvent: null });
  });

  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        trackWaiting(reg);
        // Revisa si hay versión nueva al volver a la app y cada hora.
        const check = () => reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        setInterval(check, 60 * 60 * 1000);
      })
      .catch(() => {
        /* sin SW: la app sigue funcionando online */
      });

    // Cuando la versión nueva toma el control, recarga una sola vez.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

/** Activa la versión nueva del SW (la página se recarga al tomar control). */
export function applyUpdate(): void {
  waitingWorker?.postMessage({ type: "SKIP_WAITING" });
}

/** Lanza el diálogo nativo de instalación. Devuelve true si el usuario aceptó. */
export async function promptInstall(): Promise<boolean> {
  const ev = usePwa.getState().installEvent;
  if (!ev) return false;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  usePwa.setState({ installEvent: null, installed: outcome === "accepted" });
  return outcome === "accepted";
}
