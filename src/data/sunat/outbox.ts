import type { SunatResult } from "./gateway";

/** Reintentos máximos de un comprobante en la cola antes de rechazarlo. */
export const SUNAT_MAX_ATTEMPTS = 6;

export type EmissionAction = "accept" | "reject" | "retry";

export interface EmissionDecision {
  action: EmissionAction;
  status: "aceptada" | "rechazada" | "encola";
  error: string | null;
  attempts: number; // intento actual (prevAttempts + 1) en reject/retry
  nextAttemptAt?: string; // ISO, sólo cuando action === "retry"
}

/** Backoff exponencial por intento, con tope de 6 h. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 60_000, 6 * 3_600_000);
}

/**
 * Decide qué hacer con el resultado de una emisión, de forma pura (sin I/O):
 * - aceptado → `accept`.
 * - rechazo definitivo (transient === false) → `reject`.
 * - fallo transitorio → `retry` con backoff, hasta agotar `maxAttempts` y ahí `reject`.
 * Reenviar un documento ya aceptado es idempotente en SUNAT; el llamador evita hacerlo.
 */
export function decideEmission(
  res: Pick<SunatResult, "accepted" | "transient" | "error">,
  prevAttempts: number,
  now: number = Date.now(),
  maxAttempts: number = SUNAT_MAX_ATTEMPTS,
): EmissionDecision {
  if (res.accepted) return { action: "accept", status: "aceptada", error: null, attempts: prevAttempts };
  const attempts = prevAttempts + 1;
  if (res.transient === false) {
    return { action: "reject", status: "rechazada", error: res.error ?? "Rechazado por SUNAT", attempts };
  }
  if (attempts >= maxAttempts) {
    return {
      action: "reject",
      status: "rechazada",
      error: `Reintentos agotados (${attempts}): ${res.error ?? "error de envío"}`,
      attempts,
    };
  }
  return {
    action: "retry",
    status: "encola",
    error: res.error ?? null,
    attempts,
    nextAttemptAt: new Date(now + backoffMs(attempts)).toISOString(),
  };
}
