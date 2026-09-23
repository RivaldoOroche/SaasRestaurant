// Edge Function (Deno) — emite un comprobante electrónico a SUNAT.
//
// Flujo: recibe el comprobante -> arma UBL 2.1 -> firma (RSA-SHA256) -> zip ->
// SOAP sendBill al endpoint (beta por defecto) con WSS UsernameToken -> parsea
// la respuesta (CDR o Fault) -> devuelve el resultado.
//
// Homologación beta (SUNAT):
//   SUNAT_ENDPOINT  = https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService
//   SUNAT_RUC       = 20000000001
//   SUNAT_SOL_USER  = MODDATOS
//   SUNAT_SOL_PASS  = MODDATOS
//   SUNAT_CERT_PEM  = (certificado X.509 PEM)
//   SUNAT_KEY_PEM   = (llave privada PKCS#8 PEM)
// Estos se guardan como secrets del proyecto (ver README).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitirComprobante } from "../_shared/sunat/emisor.ts";
import type { EmisorConfig } from "../_shared/sunat/emisor.ts";
import type { Comprobante, NotaCreditoRef } from "../_shared/sunat/types.ts";

/** Configuración de facturación resuelta para un tenant. */
interface TenantFiscal {
  ruc?: string;
  razonSocial?: string;
  direccion?: string;
  ubigeo?: string;
  solUser?: string;
  solPass?: string;
  certPem?: string;
  keyPem?: string;
  mode?: string; // 'beta' | 'produccion'
  provider?: string; // billing_provider
  endpoint?: string; // billing_endpoint (OSE / API)
  apiToken?: string; // token del OSE/PSE
}

/**
 * Lee el emisor (business_settings) y las credenciales secretas
 * (fiscal_credentials) del tenant usando el service role. Devuelve null si no
 * hay service role configurado o no se encuentra el tenant, para caer al
 * fallback por variables de entorno (homologación beta).
 */
async function loadTenantFiscal(tenantId?: string): Promise<TenantFiscal | null> {
  if (!tenantId) return null;
  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  try {
    const admin = createClient(url, serviceKey);
    const [{ data: settings }, { data: creds }] = await Promise.all([
      admin
        .from("business_settings")
        .select("ruc, razon_social, address, ubigeo, sol_user, sunat_mode, billing_provider, billing_endpoint")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      admin
        .from("fiscal_credentials")
        .select("sol_pass, cert_pem, key_pem, api_token")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);
    if (!settings && !creds) return null;
    return {
      ruc: settings?.ruc ?? undefined,
      razonSocial: settings?.razon_social ?? undefined,
      direccion: settings?.address ?? undefined,
      ubigeo: settings?.ubigeo ?? undefined,
      solUser: settings?.sol_user ?? undefined,
      mode: settings?.sunat_mode ?? undefined,
      provider: settings?.billing_provider ?? undefined,
      endpoint: settings?.billing_endpoint ?? undefined,
      solPass: creds?.sol_pass ?? undefined,
      certPem: creds?.cert_pem ?? undefined,
      keyPem: creds?.key_pem ?? undefined,
      apiToken: creds?.api_token ?? undefined,
    };
  } catch {
    return null;
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function env(k: string, def = ""): string {
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? def;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // DTO simple desde el frontend; el emisor sale de los secrets del proyecto.
    const dto = (await req.json()) as {
      tenantId?: string; // resuelve emisor + credenciales del tenant en el servidor
      tipo: "01" | "03" | "07";
      folio: string; // "F001-1001"
      buyerRuc?: string | null;
      buyerName?: string | null;
      subtotal: number;
      igv: number;
      total: number;
      igvTasa?: number;
      items?: { descripcion: string; cantidad: number; valorUnitario: number }[];
      // Nota de crédito (tipo 07): documento afectado + motivo.
      refFolio?: string | null; // serie-correlativo del documento afectado
      refTipo?: "01" | "03"; // tipo del documento afectado
      motivo?: string | null; // descripción del motivo
      motivoCodigo?: string; // catálogo 09 ("01" anulación por defecto)
    };
    const [serie, correlativo] = (dto.folio ?? "").split("-");
    if (!serie || !correlativo) return json({ error: "folio inválido" }, 400);

    // Configuración por tenant (si hay service role); si no, variables de entorno.
    const tf = await loadTenantFiscal(dto.tenantId);
    const provider = tf?.provider || env("SUNAT_PROVIDER", "sunat_directo");
    const igvTasa = dto.igvTasa ?? 0.18;
    const cfg: EmisorConfig = {
      provider,
      mode: tf?.mode || env("SUNAT_MODE", "beta"),
      ruc: tf?.ruc || env("SUNAT_RUC", "20000000001"),
      solUser: tf?.solUser || env("SUNAT_SOL_USER", "MODDATOS"),
      solPass: tf?.solPass || env("SUNAT_SOL_PASS", "MODDATOS"),
      certPem: tf?.certPem || env("SUNAT_CERT_PEM") || undefined,
      keyPem: tf?.keyPem || env("SUNAT_KEY_PEM") || undefined,
      endpoint: tf?.endpoint || env("SUNAT_ENDPOINT") || undefined,
      apiToken: tf?.apiToken || env("SUNAT_API_TOKEN") || undefined,
    };

    // Emisor desde el tenant o desde secrets; cliente desde el DTO (o público).
    const comp: Comprobante = {
      tipo: dto.tipo,
      serie,
      correlativo,
      fechaEmision: new Date().toISOString().slice(0, 10),
      horaEmision: new Date().toISOString().slice(11, 19),
      moneda: "PEN",
      igvTasa,
      emisor: {
        ruc: cfg.ruc,
        razonSocial: tf?.razonSocial || env("SUNAT_RAZON_SOCIAL", "EMPRESA DEMO SAC"),
        direccion: tf?.direccion || env("SUNAT_DIRECCION", "AV. LA MAR 1234, MIRAFLORES, LIMA"),
        ubigeo: tf?.ubigeo || env("SUNAT_UBIGEO", "150122"),
      },
      cliente: dto.buyerRuc
        ? { tipoDoc: "6", numDoc: dto.buyerRuc, nombre: dto.buyerName ?? "-" }
        : { tipoDoc: "-", numDoc: "-", nombre: dto.buyerName ?? "CLIENTES VARIOS" },
      items:
        dto.items && dto.items.length
          ? dto.items
          : [{ descripcion: "Consumo", cantidad: 1, valorUnitario: dto.subtotal }],
    };

    const ncRef: NotaCreditoRef | undefined =
      dto.tipo === "07"
        ? {
            tipoDocRef: dto.refTipo ?? "03",
            folioRef: dto.refFolio ?? "",
            motivoCodigo: dto.motivoCodigo ?? "01",
            motivo: dto.motivo ?? "Anulación de la operación",
          }
        : undefined;

    // Enruta la emisión según el proveedor del tenant (directo / OSE / Nubefact).
    const result = await emitirComprobante(comp, ncRef, cfg);
    return json(result, result.accepted ? 200 : result.code === "config" ? 400 : 200);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Deno runtime entrypoint (ignored by Vitest/Node).
(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
