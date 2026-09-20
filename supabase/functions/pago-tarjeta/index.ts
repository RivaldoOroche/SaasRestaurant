// Edge Function (Deno) — cobro con tarjeta. Recibe un TOKEN generado en el
// navegador con la llave PÚBLICA del proveedor (la tarjeta nunca toca nuestro
// backend) y ejecuta el cargo con la llave SECRETA del tenant, leída de
// payment_credentials con el service role.
//
//   body: { tenantId, token, amount, currency, email, description }
//   -> { success, chargeId?, error? }
//
// Implementa Culqi de forma real; Izipay/Niubiz quedan como seam documentado.

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

async function chargeCulqi(secretKey: string, amountCents: number, currency: string, email: string, token: string, description: string) {
  const resp = await fetch("https://api.culqi.com/v2/charges", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: amountCents,
      currency_code: currency,
      email,
      source_id: token,
      description: description || "Cobro POS",
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (resp.ok && data?.id) return { success: true, chargeId: data.id as string };
  const msg = data?.user_message || data?.merchant_message || `Culqi HTTP ${resp.status}`;
  return { success: false, error: String(msg) };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { tenantId, token, amount, currency = "PEN", email = "", description = "" } = await req.json();
    if (!tenantId || !token || !amount) return json({ error: "Faltan tenantId, token o amount" }, 400);

    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Falta configuración de service role" }, 500);
    const admin = createClient(url, serviceKey);

    const { data: creds } = await admin
      .from("payment_credentials")
      .select("provider, secret_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!creds?.secret_key) return json({ success: false, error: "No hay credenciales de tarjeta configuradas" });

    const amountCents = Math.round(Number(amount) * 100);
    const provider = String(creds.provider);

    if (provider === "culqi") {
      const res = await chargeCulqi(creds.secret_key, amountCents, currency, email, token, description);
      return json(res);
    }
    // Izipay / Niubiz: seam a implementar con su API de pago.
    return json({ success: false, error: `Cargo con ${provider} aún no implementado en el servidor` });
  } catch (e) {
    return json({ success: false, error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
