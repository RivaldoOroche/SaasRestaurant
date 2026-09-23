// Edge Function (Deno) — cobro con tarjeta. Recibe un TOKEN generado en el
// navegador con la llave PÚBLICA del proveedor (la tarjeta nunca toca nuestro
// backend) y ejecuta el cargo con la llave SECRETA del tenant, leída de
// payment_credentials con el service role.
//
//   body: { tenantId, token, amount, currency, email, description }
//   -> { success, chargeId?, error? }
//
// El cargo se enruta por proveedor (Culqi / Izipay / Niubiz) en
// _shared/pagos/gateway.ts. La confirmación asíncrona llega por `pago-webhook`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cobrarTarjeta } from "../_shared/pagos/gateway.ts";

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
    const { tenantId, token, amount, currency = "PEN", email = "", description = "" } = await req.json();
    if (!tenantId || !token || !amount) return json({ error: "Faltan tenantId, token o amount" }, 400);

    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Falta configuración de service role" }, 500);
    const admin = createClient(url, serviceKey);

    const { data: creds } = await admin
      .from("payment_credentials")
      .select("provider, secret_key, public_key, merchant_id, extra")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!creds) return json({ success: false, error: "No hay credenciales de tarjeta configuradas" });

    const res = await cobrarTarjeta(
      {
        provider: String(creds.provider),
        secretKey: creds.secret_key ?? undefined,
        publicKey: creds.public_key ?? undefined,
        merchantId: creds.merchant_id ?? undefined,
        extra: (creds.extra ?? {}) as Record<string, unknown>,
      },
      { amountCents: Math.round(Number(amount) * 100), currency, email, token, description },
    );
    return json(res);
  } catch (e) {
    return json({ success: false, error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
