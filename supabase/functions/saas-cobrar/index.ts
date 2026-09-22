// Edge Function (Deno) — cobro de la suscripción SaaS a un tenant, con la
// pasarela de LA PLATAFORMA (no la del tenant). Recibe un token generado con la
// llave pública de la plataforma y cobra con su llave secreta (env
// PLATFORM_CULQI_SECRET). Registra la factura SaaS y activa el tenant.
//
//   body: { tenantId, token, amount, folio }  ->  { success, chargeId?, error? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { tenantId, token, amount, folio } = await req.json();
    if (!tenantId || !token || !amount) return json({ error: "Faltan tenantId, token o amount" }, 400);

    const secret = env("PLATFORM_CULQI_SECRET");
    if (!secret) return json({ success: false, error: "Falta PLATFORM_CULQI_SECRET" }, 500);

    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Falta configuración de service role" }, 500);
    const admin = createClient(url, serviceKey);

    // 1) Cobro con la pasarela de la plataforma (Culqi).
    const resp = await fetch("https://api.culqi.com/v2/charges", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100),
        currency_code: "PEN",
        email: "billing@wayrapos.pe",
        source_id: token,
        description: `Suscripción Wayra POS ${folio ?? ""}`.trim(),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.id) {
      const msg = data?.user_message || data?.merchant_message || `Culqi HTTP ${resp.status}`;
      return json({ success: false, error: String(msg) });
    }

    // 2) Registrar factura SaaS + activar el tenant.
    const total = Number(amount);
    const base = Math.round((total / 1.18) * 100) / 100;
    await admin.from("saas_invoices").insert({
      tenant_id: tenantId,
      folio: folio ?? `NP-F001-${Math.floor(1000 + Math.random() * 9000)}`,
      amount: total,
      igv: Math.round((total - base) * 100) / 100,
      method: "tarjeta",
      paid: true,
    });
    await admin.from("tenants").update({ status: "Activo", mrr: total }).eq("id", tenantId);

    return json({ success: true, chargeId: data.id });
  } catch (e) {
    return json({ success: false, error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
