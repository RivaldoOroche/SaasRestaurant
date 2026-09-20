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
import { construirUBL, calcularTotales } from "../_shared/sunat/ubl.ts";
import { construirNotaCredito } from "../_shared/sunat/notaCredito.ts";
import { numeroALetras } from "../_shared/sunat/numeroALetras.ts";
import { firmarUBL } from "../_shared/sunat/sign.ts";
import { zipStore } from "../_shared/sunat/zip.ts";
import type { Comprobante } from "../_shared/sunat/types.ts";

const BETA = "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService";
const PROD = "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService";

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
        .select("ruc, razon_social, address, ubigeo, sol_user, sunat_mode")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      admin
        .from("fiscal_credentials")
        .select("sol_pass, cert_pem, key_pem")
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
      solPass: creds?.sol_pass ?? undefined,
      certPem: creds?.cert_pem ?? undefined,
      keyPem: creds?.key_pem ?? undefined,
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

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function soapEnvelope(ruc: string, user: string, pass: string, fileName: string, contentB64: string): string {
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe">` +
    `<soapenv:Header>` +
    `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">` +
    `<wsse:UsernameToken>` +
    `<wsse:Username>${ruc}${user}</wsse:Username>` +
    `<wsse:Password>${pass}</wsse:Password>` +
    `</wsse:UsernameToken></wsse:Security></soapenv:Header>` +
    `<soapenv:Body><ser:sendBill>` +
    `<fileName>${fileName}</fileName>` +
    `<contentFile>${contentB64}</contentFile>` +
    `</ser:sendBill></soapenv:Body></soapenv:Envelope>`
  );
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
    const ruc = tf?.ruc || env("SUNAT_RUC", "20000000001");
    const user = tf?.solUser || env("SUNAT_SOL_USER", "MODDATOS");
    const pass = tf?.solPass || env("SUNAT_SOL_PASS", "MODDATOS");
    const modo = tf?.mode || env("SUNAT_MODE", "beta");
    const endpoint = env("SUNAT_ENDPOINT", modo === "produccion" ? PROD : BETA);
    const certPem = tf?.certPem || env("SUNAT_CERT_PEM");
    const keyPem = tf?.keyPem || env("SUNAT_KEY_PEM");
    if (!certPem || !keyPem) return json({ error: "Faltan certificado/llave (fiscal_credentials o SUNAT_CERT_PEM / SUNAT_KEY_PEM)" }, 500);

    // Emisor desde el tenant o desde secrets; cliente desde el DTO (o público).
    const igvTasa = dto.igvTasa ?? 0.18;
    const comp: Comprobante = {
      tipo: dto.tipo,
      serie,
      correlativo,
      fechaEmision: new Date().toISOString().slice(0, 10),
      horaEmision: new Date().toISOString().slice(11, 19),
      moneda: "PEN",
      igvTasa,
      emisor: {
        ruc,
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

    // 1) UBL + firma. Nota de crédito (07) usa CreditNote; factura/boleta usan Invoice.
    const totales = calcularTotales(comp);
    const enLetras = `${numeroALetras(totales.total)} SOLES`;
    const xml =
      dto.tipo === "07"
        ? construirNotaCredito(
            comp,
            {
              tipoDocRef: dto.refTipo ?? "03",
              folioRef: dto.refFolio ?? "",
              motivoCodigo: dto.motivoCodigo ?? "01",
              motivo: dto.motivo ?? "Anulación de la operación",
            },
            enLetras,
          )
        : construirUBL(comp, enLetras);
    const signed = await firmarUBL(xml, { privateKeyPem: keyPem, certificatePem: certPem });

    // 2) zip: RUC-TIPO-SERIE-CORRELATIVO
    const base = `${ruc}-${comp.tipo}-${comp.serie}-${comp.correlativo}`;
    const zip = zipStore(`${base}.xml`, new TextEncoder().encode(signed));

    // 3) SOAP sendBill
    const envelope = soapEnvelope(ruc, user, pass, `${base}.zip`, b64(zip));
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: envelope,
    });
    const text = await resp.text();

    // 4) Parseo mínimo de la respuesta
    const fault = text.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
    if (fault) {
      const codeM = text.match(/<faultcode>([\s\S]*?)<\/faultcode>/);
      return json({ accepted: false, code: codeM?.[1] ?? "fault", description: fault[1], folio: base });
    }
    const appResp = text.match(/<applicationResponse>([\s\S]*?)<\/applicationResponse>/);
    if (appResp) {
      // CDR recibido = SUNAT aceptó el comprobante.
      return json({ accepted: true, code: "0", description: "Aceptado por SUNAT", folio: base, cdr: appResp[1] });
    }
    return json({ accepted: false, code: "unknown", description: "Respuesta no reconocida", raw: text.slice(0, 500) }, 502);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Deno runtime entrypoint (ignored by Vitest/Node).
(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
