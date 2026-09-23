// Capa de emisión multi-proveedor de comprobantes electrónicos.
//
// Un tenant puede facturar de tres maneras, según `business_settings.billing_provider`:
//   - "sunat_directo": arma UBL 2.1, lo firma con el certificado del tenant y lo
//     envía por SOAP (sendBill) al Web Service de SUNAT (beta o producción).
//   - "efact" / "bizlinks" (u otro OSE/PSE que exponga el WS de SUNAT): igual que
//     el directo pero apuntando al endpoint del OSE con sus credenciales.
//   - "nubefact": envía un JSON al API de Nubefact (u OSE equivalente), que arma,
//     firma y envía el comprobante por nosotros y devuelve el CDR/enlaces.
//
// Todos los proveedores devuelven un `EmitResult` normalizado, de modo que el
// resto del sistema (cola, comprobantes, UI) no depende del proveedor.

import { construirUBL, calcularTotales } from "./ubl.ts";
import { construirNotaCredito } from "./notaCredito.ts";
import { numeroALetras } from "./numeroALetras.ts";
import { firmarUBL } from "./sign.ts";
import { zipStore } from "./zip.ts";
import type { Comprobante, NotaCreditoRef } from "./types.ts";

export const SUNAT_BETA = "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService";
export const SUNAT_PROD = "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService";

export type BillingProvider = "sunat_directo" | "efact" | "bizlinks" | "nubefact" | string;

/** Configuración resuelta del emisor de un tenant (datos + credenciales). */
export interface EmisorConfig {
  provider: BillingProvider;
  mode: string; // "beta" | "produccion"
  ruc: string;
  solUser: string;
  solPass: string;
  certPem?: string;
  keyPem?: string;
  // OSE / API providers:
  endpoint?: string; // billing_endpoint (OSE SOAP o URL del API Nubefact)
  apiToken?: string; // token/API key del OSE/PSE
}

/** Resultado normalizado de una emisión, sea cual sea el proveedor. */
export interface EmitResult {
  accepted: boolean;
  code: string;
  description: string;
  folio: string; // RUC-TIPO-SERIE-CORRELATIVO
  cdr?: string; // applicationResponse (base64) cuando aplica
  xml?: string; // XML firmado cuando lo tenemos
  pdfUrl?: string; // enlace al PDF (proveedores tipo Nubefact)
  xmlUrl?: string; // enlace al XML (proveedores tipo Nubefact)
  qr?: string; // cadena para el código QR
  raw?: string; // fragmento de respuesta para depurar
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

/** Construye el XML firmado del comprobante (Invoice / CreditNote). */
async function buildSignedXml(comp: Comprobante, ncRef: NotaCreditoRef | undefined, cfg: EmisorConfig): Promise<string> {
  if (!cfg.certPem || !cfg.keyPem) {
    throw new Error("Faltan certificado/llave para firmar (fiscal_credentials o SUNAT_CERT_PEM / SUNAT_KEY_PEM)");
  }
  const totales = calcularTotales(comp);
  const enLetras = `${numeroALetras(totales.total)} SOLES`;
  const xml =
    comp.tipo === "07" && ncRef
      ? construirNotaCredito(comp, ncRef, enLetras)
      : construirUBL(comp, enLetras);
  return firmarUBL(xml, { privateKeyPem: cfg.keyPem, certificatePem: cfg.certPem });
}

/** Emisión por SOAP sendBill (SUNAT directo o un OSE con WS compatible). */
async function emitirSoap(
  comp: Comprobante,
  ncRef: NotaCreditoRef | undefined,
  cfg: EmisorConfig,
  endpoint: string,
): Promise<EmitResult> {
  const signed = await buildSignedXml(comp, ncRef, cfg);
  const base = `${cfg.ruc}-${comp.tipo}-${comp.serie}-${comp.correlativo}`;
  const zip = zipStore(`${base}.xml`, new TextEncoder().encode(signed));
  const envelope = soapEnvelope(cfg.ruc, cfg.solUser, cfg.solPass, `${base}.zip`, b64(zip));

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: envelope,
  });
  const text = await resp.text();

  const fault = text.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fault) {
    const codeM = text.match(/<faultcode>([\s\S]*?)<\/faultcode>/);
    return { accepted: false, code: codeM?.[1] ?? "fault", description: fault[1], folio: base, xml: signed };
  }
  const appResp = text.match(/<applicationResponse>([\s\S]*?)<\/applicationResponse>/);
  if (appResp) {
    return { accepted: true, code: "0", description: "Aceptado por SUNAT", folio: base, cdr: appResp[1], xml: signed };
  }
  return { accepted: false, code: "unknown", description: "Respuesta no reconocida del WS", folio: base, xml: signed, raw: text.slice(0, 500) };
}

// --- Nubefact (API REST JSON) -------------------------------------------------

// Nubefact usa códigos propios: 1 Factura, 2 Boleta, 3 Nota de crédito.
function nubefactTipo(tipo: Comprobante["tipo"]): number {
  return tipo === "01" ? 1 : tipo === "07" ? 3 : 2;
}

function fechaNubefact(iso: string): string {
  // YYYY-MM-DD -> DD-MM-YYYY
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** Emisión vía Nubefact (u OSE con el mismo contrato JSON). */
async function emitirNubefact(
  comp: Comprobante,
  ncRef: NotaCreditoRef | undefined,
  cfg: EmisorConfig,
): Promise<EmitResult> {
  const base = `${cfg.ruc}-${comp.tipo}-${comp.serie}-${comp.correlativo}`;
  if (!cfg.endpoint) return { accepted: false, code: "config", description: "Falta el endpoint (ruta) de Nubefact", folio: base };
  if (!cfg.apiToken) return { accepted: false, code: "config", description: "Falta el token de Nubefact", folio: base };

  const tasa = comp.igvTasa ?? 0.18;
  let gravada = 0;
  let igv = 0;
  const items = comp.items.map((it) => {
    const totalSinIgv = Math.round(it.cantidad * it.valorUnitario * 100) / 100;
    const igvItem = Math.round(totalSinIgv * tasa * 100) / 100;
    gravada += totalSinIgv;
    igv += igvItem;
    return {
      unidad_de_medida: it.unidad ?? "NIU",
      codigo: "",
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      valor_unitario: it.valorUnitario,
      precio_unitario: Math.round(it.valorUnitario * (1 + tasa) * 100) / 100,
      subtotal: totalSinIgv,
      tipo_de_igv: 1, // gravado - operación onerosa
      igv: igvItem,
      total: Math.round((totalSinIgv + igvItem) * 100) / 100,
      anticipo_regularizacion: false,
    };
  });
  gravada = Math.round(gravada * 100) / 100;
  igv = Math.round(igv * 100) / 100;
  const total = Math.round((gravada + igv) * 100) / 100;

  const body: Record<string, unknown> = {
    operacion: "generar_comprobante",
    tipo_de_comprobante: nubefactTipo(comp.tipo),
    serie: comp.serie,
    numero: Number(comp.correlativo),
    sunat_transaction: 1,
    cliente_tipo_de_documento: comp.cliente.tipoDoc === "-" ? 1 : Number(comp.cliente.tipoDoc),
    cliente_numero_de_documento: comp.cliente.numDoc === "-" ? "00000000" : comp.cliente.numDoc,
    cliente_denominacion: comp.cliente.nombre,
    cliente_direccion: "",
    fecha_de_emision: fechaNubefact(comp.fechaEmision),
    moneda: 1, // PEN
    porcentaje_de_igv: Math.round(tasa * 100),
    total_gravada: gravada,
    total_igv: igv,
    total,
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: false,
    items,
  };
  if (comp.tipo === "07" && ncRef) {
    const [serieRef, numRef] = ncRef.folioRef.split("-");
    body.documento_que_se_modifica_tipo = ncRef.tipoDocRef === "01" ? 1 : 2;
    body.documento_que_se_modifica_serie = serieRef;
    body.documento_que_se_modifica_numero = Number(numRef);
    body.tipo_de_nota_de_credito = Number(ncRef.motivoCodigo ?? "1");
    body.motivo_o_descripcion_de_nota_de_credito = ncRef.motivo;
  }

  const resp = await fetch(cfg.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: cfg.apiToken },
    body: JSON.stringify(body),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    errors?: string;
    aceptada_por_sunat?: boolean;
    sunat_description?: string;
    sunat_responsecode?: string;
    enlace_del_pdf?: string;
    enlace_del_xml?: string;
    cadena_para_codigo_qr?: string;
  };
  if (data.errors) {
    return { accepted: false, code: data.sunat_responsecode ?? "nubefact", description: data.errors, folio: base };
  }
  return {
    accepted: !!data.aceptada_por_sunat,
    code: data.sunat_responsecode ?? (data.aceptada_por_sunat ? "0" : "pendiente"),
    description: data.sunat_description ?? (data.aceptada_por_sunat ? "Aceptado por SUNAT" : "Enviado al proveedor"),
    folio: base,
    pdfUrl: data.enlace_del_pdf,
    xmlUrl: data.enlace_del_xml,
    qr: data.cadena_para_codigo_qr,
  };
}

/** Punto de entrada: enruta la emisión según el proveedor del tenant. */
export function emitirComprobante(
  comp: Comprobante,
  ncRef: NotaCreditoRef | undefined,
  cfg: EmisorConfig,
): Promise<EmitResult> {
  switch (cfg.provider) {
    case "nubefact":
      return emitirNubefact(comp, ncRef, cfg);
    case "efact":
    case "bizlinks": {
      // OSE con WS compatible SUNAT: firma local + sendBill a su endpoint.
      const endpoint = cfg.endpoint;
      if (!endpoint) {
        return Promise.resolve({
          accepted: false,
          code: "config",
          description: `Falta el endpoint del OSE (${cfg.provider})`,
          folio: `${cfg.ruc}-${comp.tipo}-${comp.serie}-${comp.correlativo}`,
        });
      }
      return emitirSoap(comp, ncRef, cfg, endpoint);
    }
    case "sunat_directo":
    default: {
      const endpoint = cfg.endpoint || (cfg.mode === "produccion" ? SUNAT_PROD : SUNAT_BETA);
      return emitirSoap(comp, ncRef, cfg, endpoint);
    }
  }
}
