// Observabilidad del frontend.
//
// · Con VITE_SENTRY_DSN: Sentry (errores, contexto del restaurante/sucursal,
//   release, trazas de rendimiento muestreadas). Se carga en diferido para no
//   pesar en el arranque del POS.
// · Con VITE_ERROR_WEBHOOK: además (o en su lugar) un beacon JSON a un
//   endpoint propio.
// · Sin nada configurado: solo consola.
//
// Privacidad (Ley 29733): no se envían datos personales. Sin IP, sin correos,
// sin nombres de clientes; el usuario se identifica solo por un id opaco.

type SentryModule = typeof import("@sentry/react");

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const WEBHOOK = import.meta.env.VITE_ERROR_WEBHOOK as string | undefined;
const RELEASE = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";
const ENV = (import.meta.env.VITE_APP_ENV as string | undefined) ?? import.meta.env.MODE;

export interface ObsContext {
  tenantId?: string | null;
  branchId?: string | null;
  role?: string | null;
  /** id opaco de la cuenta o del personal (nunca el nombre/correo). */
  userId?: string | null;
  deviceId?: string | null;
}

interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  at: string;
  kind: "error" | "unhandledrejection" | "react" | "manual";
  context: ObsContext;
  release: string;
}

let sentry: SentryModule | null = null;
let context: ObsContext = {};
let installed = false;

/** Quita datos personales evidentes de un texto (correos, DNI/RUC, teléfonos). */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/\b\d{11}\b/g, "[ruc]")
    .replace(/\b\d{8}\b/g, "[dni]")
    .replace(/\b9\d{8}\b/g, "[telefono]");
}

function beacon(r: ErrorReport) {
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

/** Reporta un error (usado por el ErrorBoundary y por código que atrapa errores). */
export function captureError(err: unknown, kind: ErrorReport["kind"] = "manual", extra?: Record<string, unknown>) {
  const e = err as { message?: string; stack?: string } | undefined;
  const message = scrub(e?.message ?? String(err ?? "Error"));
  console.error(`[obs:${kind}]`, message, e?.stack ?? "");
  if (sentry) sentry.captureException(err instanceof Error ? err : new Error(message), { tags: { kind }, extra });
  beacon({ kind, message, stack: e?.stack, url: location.pathname, at: new Date().toISOString(), context, release: RELEASE });
}

/** Situación anómala que no rompe la app (p. ej. una operación rechazada por el servidor). */
export function captureWarning(message: string, extra?: Record<string, unknown>) {
  console.warn(`[obs:warning]`, scrub(message));
  sentry?.captureMessage(scrub(message), { level: "warning", extra });
}

/** Rastro de lo que pasó antes de un error (p. ej. cambios de conexión o de sincronización). */
export function breadcrumb(category: string, message: string, data?: Record<string, unknown>) {
  sentry?.addBreadcrumb({ category, message: scrub(message), data, level: "info" });
}

/** Actualiza el contexto (restaurante, sucursal, rol) que acompaña a cada error. */
export function setObservabilityContext(next: ObsContext) {
  context = { ...context, ...next };
  if (!sentry) return;
  sentry.setUser(context.userId ? { id: context.userId } : null);
  sentry.setTags({
    tenant: context.tenantId ?? "none",
    branch: context.branchId ?? "none",
    role: context.role ?? "none",
    device: context.deviceId ?? "none",
  });
}

async function initSentry() {
  if (!DSN) return;
  try {
    const S = await import("@sentry/react");
    S.init({
      dsn: DSN,
      release: RELEASE,
      environment: ENV,
      sendDefaultPii: false,
      integrations: [S.browserTracingIntegration()],
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES ?? 0.05),
      // Errores de red esperables sin conexión: el POS los maneja (cola offline).
      ignoreErrors: ["Failed to fetch", "NetworkError", "Load failed", "AbortError"],
      beforeSend(event) {
        if (event.user) event.user = { id: event.user.id };
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
          if (event.request.url) event.request.url = event.request.url.split("?")[0];
        }
        if (event.message) event.message = scrub(event.message);
        for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrub(ex.value);
        return event;
      },
      beforeBreadcrumb(b) {
        // Las URLs de fetch pueden llevar tokens o filtros con datos: solo la ruta.
        if (b.data?.url && typeof b.data.url === "string") b.data.url = b.data.url.split("?")[0];
        return b;
      },
    });
    sentry = S;
    setObservabilityContext(context);
  } catch (e) {
    console.warn("[obs] no se pudo iniciar Sentry", e);
  }
}

/** Instala los manejadores globales de error. Idempotente. */
export function initObservability(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  void initSentry();

  // Sentry ya captura estos por su cuenta; sin Sentry, los reportamos nosotros.
  window.addEventListener("error", (e) => {
    if (!sentry) captureErrorNoSentry(e.error ?? e.message, "error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (!sentry) captureErrorNoSentry(e.reason, "unhandledrejection");
  });
}

function captureErrorNoSentry(err: unknown, kind: ErrorReport["kind"]) {
  const e = err as { message?: string; stack?: string } | undefined;
  const message = scrub(e?.message ?? String(err ?? "Error"));
  console.error(`[obs:${kind}]`, message, e?.stack ?? "");
  beacon({ kind, message, stack: e?.stack, url: location.pathname, at: new Date().toISOString(), context, release: RELEASE });
}
