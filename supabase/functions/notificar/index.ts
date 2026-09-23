// Edge Function (Deno) — envía una notificación (correo o WhatsApp).
//
//   body: { channel: "email" | "whatsapp", to, subject, message }
//   -> { ok, skipped?, error? }
//
// Requiere autenticación (el cliente la invoca con su sesión). Los secretos del
// proveedor viven solo aquí (RESEND_API_KEY / WHATSAPP_API_*).

import { notificar } from "../_shared/notificaciones/mailer.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { channel = "email", to, subject = "Notificación", message = "" } = await req.json();
    if (!to || !message) return json({ error: "Faltan destinatario o mensaje" }, 400);
    const res = await notificar(String(channel), String(to), String(subject), String(message));
    return json(res, res.ok || res.skipped ? 200 : 502);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
