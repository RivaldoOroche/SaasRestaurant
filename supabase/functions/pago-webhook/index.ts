// Edge Function (Deno) — receptor de webhooks de pasarelas de pago.
//
// La pasarela (Culqi / Izipay / Niubiz) llama a esta URL cuando cambia el estado
// de un cargo. Registramos el evento de forma IDEMPOTENTE (unique provider,
// event_id) para que un reintento de la pasarela no lo procese dos veces, y
// opcionalmente verificamos la firma HMAC con el `webhook_secret` del tenant.
//
//   POST /pago-webhook?provider=culqi&tenant=<uuid>
//   headers: x-signature: <hmac-sha256 hex del cuerpo>   (opcional)
//   -> { received: true, duplicate?: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function env(k: string, def = ""): string {
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? def;
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Extrae los campos comunes de un evento, tolerante al formato del proveedor. */
async function normalize(provider: string, raw: unknown, rawText: string) {
  const o = (raw ?? {}) as Record<string, unknown>;
  const data = (o.data ?? o.answer ?? o) as Record<string, unknown>;
  const eventId =
    (o.id as string) ||
    (data.id as string) ||
    (data.uuid as string) ||
    (o.transactionId as string) ||
    (await sha256Hex(rawText)).slice(0, 32); // fallback estable por contenido
  const chargeId = (data.id as string) || (data.uuid as string) || (data.transactionId as string) || undefined;
  const amountRaw = Number(data.amount ?? o.amount ?? 0);
  // Culqi/Izipay/Niubiz manejan montos en céntimos.
  const amount = amountRaw > 1000 ? amountRaw / 100 : amountRaw;
  const status =
    (data.status as string) ||
    ((data.outcome as Record<string, unknown>)?.type as string) ||
    (o.type as string) ||
    "desconocido";
  return { provider, eventId, eventType: (o.type as string) ?? null, chargeId: chargeId ?? null, amount: amount || null, status };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const u = new URL(req.url);
    const provider = u.searchParams.get("provider") ?? "culqi";
    const tenantId = u.searchParams.get("tenant");
    const rawText = await req.text();

    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Falta configuración de service role" }, 500);
    const admin = createClient(url, serviceKey);

    // Verificación de firma opcional con el webhook_secret del tenant.
    if (tenantId) {
      const { data: creds } = await admin
        .from("payment_credentials")
        .select("webhook_secret")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const secret = creds?.webhook_secret as string | undefined;
      const sig = req.headers.get("x-signature");
      if (secret && sig) {
        const expected = await hmacHex(secret, rawText);
        if (expected !== sig.toLowerCase()) return json({ error: "Firma inválida" }, 401);
      }
    }

    let parsed: unknown = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Algunos IPN llegan form-encoded (p.ej. Izipay kr-answer): intenta rescatarlo.
      const params = new URLSearchParams(rawText);
      const answer = params.get("kr-answer");
      parsed = answer ? JSON.parse(answer) : Object.fromEntries(params);
    }

    const ev = await normalize(provider, parsed, rawText);

    // Inserción idempotente: si (provider, event_id) ya existe, es un reintento.
    const { error } = await admin.from("payment_events").insert({
      tenant_id: tenantId,
      provider: ev.provider,
      event_id: ev.eventId,
      event_type: ev.eventType,
      charge_id: ev.chargeId,
      amount: ev.amount,
      status: ev.status,
      raw: parsed,
    });
    if (error) {
      // 23505 = unique_violation → ya procesado.
      if ((error as { code?: string }).code === "23505") return json({ received: true, duplicate: true });
      throw error;
    }

    // Traza en la bitácora (si hay tenant).
    if (tenantId) {
      await admin.from("activity_log").insert({
        tenant_id: tenantId,
        actor: "Pasarela",
        message: `Webhook ${ev.provider}: cargo ${ev.chargeId ?? "?"} · ${ev.status}`,
      });
    }

    return json({ received: true });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
