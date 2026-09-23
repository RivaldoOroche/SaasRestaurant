// Observabilidad del frontend, sin dependencias.
//
// Captura errores no controlados y promesas rechazadas y, si hay un webhook
// configurado (VITE_ERROR_WEBHOOK, p. ej. un endpoint de Sentry/Logflare o uno
// propio), envía un beacon con el detalle. Sin webhook, solo registra en consola.
// Para Sentry completo, añade @sentry/browser y reemplaza `report`.

const WEBHOOK = import.meta.env.VITE_ERROR_WEBHOOK as string | undefined;

interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  at: string;
  kind: "error" | "unhandledrejection";
}

function report(r: ErrorReport) {
  // Consola siempre (útil en dev y en el inspector del cliente).
  console.error(`[obs:${r.kind}]`, r.message, r.stack ?? "");
  if (!WEBHOOK) return;
  try {
    const body = JSON.stringify(r);
    // sendBeacon no bloquea la navegación; fallback a fetch keepalive.
    if (navigator.sendBeacon) navigator.sendBeacon(WEBHOOK, body);
    else void fetch(WEBHOOK, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  } catch {
    /* nunca dejamos que el reporte rompa la app */
  }
}

let installed = false;

/** Instala los manejadores globales de error. Idempotente. */
export function initObservability(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    report({
      kind: "error",
      message: e.message || String(e.error ?? "Error"),
      stack: e.error?.stack,
      url: location.href,
      at: new Date().toISOString(),
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    report({
      kind: "unhandledrejection",
      message: reason?.message ?? String(e.reason ?? "Promesa rechazada"),
      stack: reason?.stack,
      url: location.href,
      at: new Date().toISOString(),
    });
  });
}
