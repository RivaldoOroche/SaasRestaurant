// Edge Function (Deno) — envía notificaciones Web Push a los usuarios indicados.
//
//   body: { userIds?: string[], tenantId?: string, title, body, url? }
//   -> { ok, sent, failed, removed }
//
// Busca las suscripciones (service role), cifra el payload y las envía con las
// claves VAPID (secretas, solo en el servidor). Borra las suscripciones caducadas
// (404/410). Si faltan las claves VAPID, responde skipped (como notificar).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush, type PushSubscription } from "../_shared/push/webpush.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function env(k: string, def = ""): string {
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? def;
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const b = await req.json();
    const title = String(b.title ?? "Wayra POS").slice(0, 120);
    const message = String(b.body ?? "").slice(0, 400);
    const clickUrl = String(b.url ?? "/");
    const userIds: string[] = Array.isArray(b.userIds) ? b.userIds.map(String) : [];
    const tenantId: string | null = b.tenantId ? String(b.tenantId) : null;
    if (!message) return json({ error: "Falta el cuerpo del mensaje" }, 400);

    const vapidPublic = env("VAPID_PUBLIC_KEY");
    const vapidPrivate = env("VAPID_PRIVATE_KEY");
    const subject = env("VAPID_SUBJECT", "mailto:soporte@wayrapos.pe");
    if (!vapidPublic || !vapidPrivate) {
      return json({ ok: false, skipped: true, reason: "VAPID no configurado" }, 200);
    }

    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Backend no configurado" }, 500);
    const admin = createClient(url, serviceKey);

    let q = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, user_id, tenant_id");
    if (userIds.length > 0) q = q.in("user_id", userIds);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data: subs, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const payload = JSON.stringify({ title, body: message, url: clickUrl });
    let sent = 0;
    let failed = 0;
    const toRemove: string[] = [];

    for (const s of subs ?? []) {
      const sub: PushSubscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      const r = await sendWebPush(sub, payload, { vapidPublic, vapidPrivate, subject });
      if (r.ok) sent++;
      else {
        failed++;
        if (r.gone) toRemove.push(s.id);
      }
    }
    if (toRemove.length > 0) await admin.from("push_subscriptions").delete().in("id", toRemove);

    return json({ ok: true, sent, failed, removed: toRemove.length });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
