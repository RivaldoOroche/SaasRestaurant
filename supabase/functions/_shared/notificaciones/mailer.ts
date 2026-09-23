// Envío de notificaciones (correo y WhatsApp) para las Edge Functions.
//
// Correo: Resend (RESEND_API_KEY + NOTIFY_FROM). WhatsApp: un endpoint HTTP
// configurable (WHATSAPP_API_URL + WHATSAPP_API_TOKEN) compatible con Twilio /
// Meta Cloud API / un proveedor propio. Ambos son best-effort: si no hay
// credenciales, no fallan (devuelven skipped) para no romper el flujo principal.

function env(k: string, def = ""): string {
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? def;
}

export interface NotifyResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/** Envía un correo con Resend. */
export async function enviarEmail(to: string, subject: string, html: string): Promise<NotifyResult> {
  const key = env("RESEND_API_KEY");
  const from = env("NOTIFY_FROM", "Wayra POS <noreply@wayrapos.pe>");
  if (!key) return { ok: false, skipped: true, error: "RESEND_API_KEY no configurado" };
  if (!to) return { ok: false, skipped: true, error: "destinatario vacío" };
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (resp.ok) return { ok: true };
  const t = await resp.text().catch(() => "");
  return { ok: false, error: `Resend HTTP ${resp.status}: ${t.slice(0, 200)}` };
}

/** Envía un WhatsApp a un endpoint HTTP configurable (seam para Twilio/Meta). */
export async function enviarWhatsapp(to: string, text: string): Promise<NotifyResult> {
  const url = env("WHATSAPP_API_URL");
  const token = env("WHATSAPP_API_TOKEN");
  if (!url) return { ok: false, skipped: true, error: "WHATSAPP_API_URL no configurado" };
  if (!to) return { ok: false, skipped: true, error: "destinatario vacío" };
  const resp = await fetch(url, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: JSON.stringify({ to, message: text }),
  });
  if (resp.ok) return { ok: true };
  return { ok: false, error: `WhatsApp HTTP ${resp.status}` };
}

/** Envía por el canal indicado. `message` se usa tal cual en WhatsApp y como HTML en correo. */
export async function notificar(channel: string, to: string, subject: string, message: string): Promise<NotifyResult> {
  if (channel === "whatsapp") return enviarWhatsapp(to, message);
  return enviarEmail(to, subject, message);
}
