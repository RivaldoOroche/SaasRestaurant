// Edge Function (Deno) — tareas programadas de la plataforma.
//
// Corre dos cosas con el service role:
//   1) DUNNING: propone cobros de suscripción del periodo actual para los
//      tenants Activos/Suspendidos que aún no tienen una propuesta abierta.
//      NO cobra: solo crea la propuesta, que el dueño del SaaS debe aprobar.
//   2) ALERTAS: cuenta señales de falla de las últimas 24 h (comprobantes
//      rechazados, cobros de suscripción fallidos, tenants suspendidos) y, si
//      hay novedades, envía un resumen por correo al contacto de la plataforma.
//
// Protección: si CRON_SECRET está definido, exige el header x-cron-secret.
// Invocación: GitHub Action programada o pg_cron (ver OBSERVABILITY.md).
//
//   POST /cron-tareas   headers: x-cron-secret: <secreto>
//   -> { ok, dunning: { proposed }, alerts: {...}, notified }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarEmail } from "../_shared/notificaciones/mailer.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function env(k: string, def = ""): string {
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? def;
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type Admin = ReturnType<typeof createClient>;

function period(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

async function runDunning(admin: Admin): Promise<number> {
  const p = period();
  const { data: plans } = await admin.from("subscription_plans").select("tier, price");
  const price = new Map((plans ?? []).map((r: { tier: string; price: number }) => [r.tier, Number(r.price)]));
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, name, plan, status")
    .in("status", ["Activo", "Suspendido"]);
  let proposed = 0;
  for (const t of tenants ?? []) {
    const { data: open } = await admin
      .from("subscription_charges")
      .select("id")
      .eq("tenant_id", t.id)
      .eq("period", p)
      .in("status", ["pendiente", "aprobada", "cobrada"])
      .maybeSingle();
    if (open) continue;
    const total = price.get(t.plan) ?? 0;
    const base = Math.round((total / 1.18) * 100) / 100;
    const { data: bs } = await admin
      .from("business_settings")
      .select("ruc, razon_social")
      .eq("tenant_id", t.id)
      .maybeSingle();
    const { error } = await admin.from("subscription_charges").insert({
      tenant_id: t.id,
      plan: t.plan,
      base,
      igv: Math.round((total - base) * 100) / 100,
      total,
      ruc: bs?.ruc ?? null,
      razon_social: bs?.razon_social ?? t.name,
      period: p,
      status: "pendiente",
    });
    if (!error) proposed++;
  }
  if (proposed > 0) {
    await admin.from("platform_activity").insert({ actor: "Cron", message: `Dunning: ${proposed} cobro(s) propuesto(s) para ${p}` });
  }
  return proposed;
}

async function gatherAlerts(admin: Admin) {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const rejectedCpe = await admin
    .from("comprobantes")
    .select("id", { count: "exact", head: true })
    .eq("status", "rechazada")
    .gte("issued_at", since);
  const failedCharges = await admin
    .from("subscription_charges")
    .select("id", { count: "exact", head: true })
    .eq("status", "fallida");
  const suspended = await admin
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("status", "Suspendido");
  return {
    comprobantesRechazados: rejectedCpe.count ?? 0,
    cobrosFallidos: failedCharges.count ?? 0,
    tenantsSuspendidos: suspended.count ?? 0,
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = env("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return json({ error: "No autorizado" }, 401);

  try {
    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Falta configuración de service role" }, 500);
    const admin = createClient(url, serviceKey);

    const proposed = await runDunning(admin);
    const alerts = await gatherAlerts(admin);
    const totalAlerts = alerts.comprobantesRechazados + alerts.cobrosFallidos + alerts.tenantsSuspendidos;

    let notified = false;
    if (totalAlerts > 0) {
      const { data: settings } = await admin.from("platform_settings").select("billing_email").eq("id", true).maybeSingle();
      const to = settings?.billing_email as string | undefined;
      if (to) {
        const res = await enviarEmail(
          to,
          `Wayra POS — Resumen de alertas (${new Date().toLocaleDateString("es-PE")})`,
          `<p>Resumen de las últimas 24 horas:</p>
           <ul>
             <li>Comprobantes rechazados por SUNAT: <b>${alerts.comprobantesRechazados}</b></li>
             <li>Cobros de suscripción fallidos: <b>${alerts.cobrosFallidos}</b></li>
             <li>Tenants suspendidos: <b>${alerts.tenantsSuspendidos}</b></li>
           </ul>
           <p>Revisa la Bitácora y los Cobros en la consola SaaS.</p>`,
        );
        notified = res.ok;
      }
    }

    return json({ ok: true, dunning: { proposed }, alerts, notified });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
