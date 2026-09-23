// Edge Function (Deno) — cobro de la suscripción SaaS a un tenant, con la
// pasarela de LA PLATAFORMA (no la del tenant). Recibe un token generado con la
// llave pública de la plataforma y cobra con su llave secreta (env
// PLATFORM_CULQI_SECRET). Registra la factura SaaS y activa el tenant.
//
//   body: { tenantId, token, amount, folio }  ->  { success, chargeId?, error? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitirComprobante, type EmisorConfig } from "../_shared/sunat/emisor.ts";
import type { Comprobante } from "../_shared/sunat/types.ts";

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

type Admin = ReturnType<typeof createClient>;

/** Emite la factura de suscripción a SUNAT con el emisor de la plataforma. */
async function emitirFacturaSaas(admin: Admin, tenantId: string, folio: string, base: number, total: number): Promise<void> {
  const { data: ps } = await admin
    .from("platform_settings")
    .select("razon_social, ruc, direccion, billing_provider, sunat_mode, sol_user, billing_endpoint")
    .eq("id", true)
    .maybeSingle();
  const { data: creds } = await admin
    .from("platform_fiscal_credentials")
    .select("sol_pass, cert_pem, key_pem, api_token")
    .eq("id", true)
    .maybeSingle();
  if (!ps?.ruc) return; // sin emisor configurado, no emitimos

  // Comprador = el tenant (razón social + RUC de su business_settings).
  const [{ data: t }, { data: bs }] = await Promise.all([
    admin.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    admin.from("business_settings").select("ruc, razon_social").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  // Serie-correlativo a partir del folio (…-F001-1234).
  const parts = String(folio).split("-");
  const serie = parts.length >= 2 ? parts[parts.length - 2] : "F001";
  const correlativo = parts.length >= 1 ? parts[parts.length - 1] : "1";

  const cfg: EmisorConfig = {
    provider: ps.billing_provider ?? "sunat_directo",
    mode: ps.sunat_mode ?? "beta",
    ruc: ps.ruc,
    solUser: ps.sol_user ?? "",
    solPass: creds?.sol_pass ?? "",
    certPem: creds?.cert_pem ?? undefined,
    keyPem: creds?.key_pem ?? undefined,
    endpoint: ps.billing_endpoint ?? undefined,
    apiToken: creds?.api_token ?? undefined,
  };
  const comp: Comprobante = {
    tipo: "01", // factura (el comprador es una empresa con RUC)
    serie,
    correlativo,
    fechaEmision: new Date().toISOString().slice(0, 10),
    horaEmision: new Date().toISOString().slice(11, 19),
    moneda: "PEN",
    igvTasa: 0.18,
    emisor: { ruc: ps.ruc, razonSocial: ps.razon_social ?? "", direccion: ps.direccion ?? "", ubigeo: "150101" },
    cliente: bs?.ruc
      ? { tipoDoc: "6", numDoc: bs.ruc, nombre: bs.razon_social ?? t?.name ?? "-" }
      : { tipoDoc: "-", numDoc: "-", nombre: t?.name ?? "CLIENTE" },
    items: [{ descripcion: `Suscripción Wayra POS ${serie}-${correlativo}`, cantidad: 1, valorUnitario: base }],
  };

  const res = await emitirComprobante(comp, undefined, cfg);
  void total;
  await admin.from("platform_activity").insert({
    actor: "Facturación",
    message: res.accepted
      ? `Factura de suscripción ${res.folio} aceptada por SUNAT`
      : `Factura de suscripción ${folio} no aceptada: ${res.description}`,
  });
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
    const invoiceFolio = folio ?? `NP-F001-${Math.floor(1000 + Math.random() * 9000)}`;
    await admin.from("saas_invoices").insert({
      tenant_id: tenantId,
      folio: invoiceFolio,
      amount: total,
      igv: Math.round((total - base) * 100) / 100,
      method: "tarjeta",
      paid: true,
    });
    await admin.from("tenants").update({ status: "Activo", mrr: total }).eq("id", tenantId);

    // 3) Emitir la factura de suscripción a SUNAT con el emisor de la PLATAFORMA
    //    y el proveedor configurado (SUNAT directo u OSE). Best-effort: si falla
    //    o no está configurado, el cobro no se revierte; se registra en bitácora.
    try {
      await emitirFacturaSaas(admin, tenantId, invoiceFolio, base, total);
    } catch (e) {
      await admin.from("platform_activity").insert({
        actor: "Facturación",
        message: `No se pudo emitir la factura de suscripción ${invoiceFolio}: ${String((e as Error).message ?? e)}`,
      });
    }

    return json({ success: true, chargeId: data.id });
  } catch (e) {
    return json({ success: false, error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
