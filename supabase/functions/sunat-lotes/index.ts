// Edge Function (Deno) — envíos de lote a SUNAT: Resumen diario de boletas (RC)
// y Comunicación de baja (RA). Ambos usan sendSummary, que es ASÍNCRONO: SUNAT
// devuelve un ticket y luego se consulta getStatus para obtener el CDR.
//
//   action: "send"   { kind: "RC"|"RA", id, fechaReferencia, lineas, tenantId }  -> { ticket }
//   action: "status" { ticket, tenantId }                                          -> { status, cdr? }
//
// Emisor y credenciales se resuelven por tenant (business_settings +
// fiscal_credentials) vía service role, con fallback a variables de entorno.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { construirResumenDiario, construirComunicacionBaja } from "../_shared/sunat/lotes.ts";
import { firmarUBL } from "../_shared/sunat/sign.ts";
import { zipStore } from "../_shared/sunat/zip.ts";
import type { ResumenLinea, BajaLinea } from "../_shared/sunat/types.ts";

const BETA = "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService";
const PROD = "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService";

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

interface TenantFiscal {
  ruc?: string; razonSocial?: string; direccion?: string; ubigeo?: string;
  solUser?: string; solPass?: string; certPem?: string; keyPem?: string; mode?: string;
}
async function loadTenantFiscal(tenantId?: string): Promise<TenantFiscal | null> {
  if (!tenantId) return null;
  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  try {
    const admin = createClient(url, serviceKey);
    const [{ data: s }, { data: c }] = await Promise.all([
      admin.from("business_settings").select("ruc, razon_social, address, ubigeo, sol_user, sunat_mode").eq("tenant_id", tenantId).maybeSingle(),
      admin.from("fiscal_credentials").select("sol_pass, cert_pem, key_pem").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (!s && !c) return null;
    return {
      ruc: s?.ruc ?? undefined, razonSocial: s?.razon_social ?? undefined, direccion: s?.address ?? undefined,
      ubigeo: s?.ubigeo ?? undefined, solUser: s?.sol_user ?? undefined, mode: s?.sunat_mode ?? undefined,
      solPass: c?.sol_pass ?? undefined, certPem: c?.cert_pem ?? undefined, keyPem: c?.key_pem ?? undefined,
    };
  } catch {
    return null;
  }
}

function soapSendSummary(ruc: string, user: string, pass: string, fileName: string, contentB64: string): string {
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe">` +
    `<soapenv:Header><wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">` +
    `<wsse:UsernameToken><wsse:Username>${ruc}${user}</wsse:Username><wsse:Password>${pass}</wsse:Password></wsse:UsernameToken>` +
    `</wsse:Security></soapenv:Header>` +
    `<soapenv:Body><ser:sendSummary><fileName>${fileName}</fileName><contentFile>${contentB64}</contentFile></ser:sendSummary></soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}
function soapGetStatus(ruc: string, user: string, pass: string, ticket: string): string {
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe">` +
    `<soapenv:Header><wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">` +
    `<wsse:UsernameToken><wsse:Username>${ruc}${user}</wsse:Username><wsse:Password>${pass}</wsse:Password></wsse:UsernameToken>` +
    `</wsse:Security></soapenv:Header>` +
    `<soapenv:Body><ser:getStatus><ticket>${ticket}</ticket></ser:getStatus></soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const dto = await req.json();
    const tf = await loadTenantFiscal(dto.tenantId);
    const ruc = tf?.ruc || env("SUNAT_RUC", "20000000001");
    const user = tf?.solUser || env("SUNAT_SOL_USER", "MODDATOS");
    const pass = tf?.solPass || env("SUNAT_SOL_PASS", "MODDATOS");
    const modo = tf?.mode || env("SUNAT_MODE", "beta");
    const endpoint = env("SUNAT_ENDPOINT", modo === "produccion" ? PROD : BETA);

    if (dto.action === "status") {
      if (!dto.ticket) return json({ error: "falta ticket" }, 400);
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
        body: soapGetStatus(ruc, user, pass, dto.ticket),
      });
      const text = await resp.text();
      const code = text.match(/<statusCode>([\s\S]*?)<\/statusCode>/)?.[1];
      const content = text.match(/<content>([\s\S]*?)<\/content>/)?.[1];
      // 0 = proceso terminó y hubo observaciones/aceptado; 98 = en proceso; 99 = con errores.
      return json({ statusCode: code ?? "unknown", cdr: content ?? null });
    }

    // action: "send"
    const certPem = tf?.certPem || env("SUNAT_CERT_PEM");
    const keyPem = tf?.keyPem || env("SUNAT_KEY_PEM");
    if (!certPem || !keyPem) return json({ error: "Faltan certificado/llave (fiscal_credentials o SUNAT_CERT_PEM / SUNAT_KEY_PEM)" }, 500);

    const emisor = {
      ruc,
      razonSocial: tf?.razonSocial || env("SUNAT_RAZON_SOCIAL", "EMPRESA DEMO SAC"),
      direccion: tf?.direccion || env("SUNAT_DIRECCION", "AV. LA MAR 1234, MIRAFLORES, LIMA"),
      ubigeo: tf?.ubigeo || env("SUNAT_UBIGEO", "150122"),
    };
    const today = new Date().toISOString().slice(0, 10);

    let xml: string;
    if (dto.kind === "RA") {
      xml = construirComunicacionBaja({
        id: dto.id,
        fechaReferencia: dto.fechaReferencia ?? today,
        fechaGeneracion: today,
        emisor,
        lineas: (dto.lineas ?? []) as BajaLinea[],
      });
    } else {
      xml = construirResumenDiario({
        id: dto.id,
        fechaReferencia: dto.fechaReferencia ?? today,
        fechaGeneracion: today,
        emisor,
        lineas: (dto.lineas ?? []) as ResumenLinea[],
      });
    }

    const signed = await firmarUBL(xml, { privateKeyPem: keyPem, certificatePem: certPem });
    const base = `${ruc}-${dto.id}`; // p.ej. 20000000001-RC-20260920-1
    const zip = zipStore(`${base}.xml`, new TextEncoder().encode(signed));
    const envelope = soapSendSummary(ruc, user, pass, `${base}.zip`, b64(zip));
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: envelope,
    });
    const text = await resp.text();
    const fault = text.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
    if (fault) return json({ accepted: false, description: fault[1], folio: base });
    const ticket = text.match(/<ticket>([\s\S]*?)<\/ticket>/)?.[1];
    if (ticket) return json({ accepted: true, ticket, folio: base, xml: signed });
    return json({ accepted: false, description: "Respuesta no reconocida", raw: text.slice(0, 500) }, 502);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
