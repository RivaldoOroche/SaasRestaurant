// Documentos "de lote" que SUNAT recibe por sendSummary (asíncrono, devuelve un
// ticket): el Resumen diario de boletas (RC, SummaryDocuments) y la Comunicación
// de baja (RA, VoidedDocuments). Ambos dejan <ext:ExtensionContent> vacío para
// que sign.ts inyecte la firma, igual que las facturas.

import type { ResumenDoc, BajaDoc } from "./types.ts";

const SAC = "urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function n2(v: number): string {
  return v.toFixed(2);
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function emisorParty(e: ResumenDoc["emisor"]): string {
  return (
    `<cac:AccountingSupplierParty>` +
    `<cbc:CustomerAssignedAccountID>${esc(e.ruc)}</cbc:CustomerAssignedAccountID>` +
    `<cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>` +
    `<cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${esc(e.razonSocial)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party>` +
    `</cac:AccountingSupplierParty>`
  );
}
function firmaRef(e: ResumenDoc["emisor"]): string {
  return (
    `<cac:Signature>` +
    `<cbc:ID>${esc(e.ruc)}</cbc:ID>` +
    `<cac:SignatoryParty><cac:PartyIdentification><cbc:ID>${esc(e.ruc)}</cbc:ID></cac:PartyIdentification>` +
    `<cac:PartyName><cbc:Name>${esc(e.razonSocial)}</cbc:Name></cac:PartyName></cac:SignatoryParty>` +
    `<cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#Sign</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment>` +
    `</cac:Signature>`
  );
}
const EXT = `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>`;

/** Resumen diario de boletas (RC) — SummaryDocuments-1. */
export function construirResumenDiario(rc: ResumenDoc): string {
  const moneda = rc.moneda ?? "PEN";
  const tasa = rc.igvTasa ?? 0.18;
  const ns = [
    'xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1"',
    `xmlns:sac="${SAC}"`,
    'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
    'xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"',
    'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"',
  ].join(" ");

  const lineas = rc.lineas
    .map((l, i) => {
      const gravado = round2(l.gravado);
      const igv = round2(l.igv);
      const total = round2(l.total);
      return (
        `<sac:SummaryDocumentsLine>` +
        `<cbc:LineID>${i + 1}</cbc:LineID>` +
        `<cbc:DocumentTypeCode>${l.tipoDoc}</cbc:DocumentTypeCode>` +
        `<cbc:ID>${esc(l.serie)}-${esc(l.correlativo)}</cbc:ID>` +
        `<cac:AccountingCustomerParty>` +
        `<cbc:CustomerAssignedAccountID>${esc(l.clienteNumDoc)}</cbc:CustomerAssignedAccountID>` +
        `<cbc:AdditionalAccountID>${l.clienteTipoDoc}</cbc:AdditionalAccountID>` +
        `</cac:AccountingCustomerParty>` +
        `<cac:Status><cbc:ConditionCode>${l.estado ?? "1"}</cbc:ConditionCode></cac:Status>` +
        `<sac:TotalAmount currencyID="${moneda}">${n2(total)}</sac:TotalAmount>` +
        `<sac:BillingPayment><cbc:PaidAmount currencyID="${moneda}">${n2(gravado)}</cbc:PaidAmount>` +
        `<cbc:InstructionID>01</cbc:InstructionID></sac:BillingPayment>` +
        `<cac:TaxTotal>` +
        `<cbc:TaxAmount currencyID="${moneda}">${n2(igv)}</cbc:TaxAmount>` +
        `<cac:TaxSubtotal>` +
        `<cbc:TaxAmount currencyID="${moneda}">${n2(igv)}</cbc:TaxAmount>` +
        `<cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>` +
        `</cac:TaxSubtotal></cac:TaxTotal>` +
        `</sac:SummaryDocumentsLine>`
      );
    })
    .join("");
  void tasa;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` +
    `<SummaryDocuments ${ns}>` +
    EXT +
    `<cbc:UBLVersionID>2.0</cbc:UBLVersionID>` +
    `<cbc:CustomizationID>1.1</cbc:CustomizationID>` +
    `<cbc:ID>${esc(rc.id)}</cbc:ID>` +
    `<cbc:ReferenceDate>${rc.fechaReferencia}</cbc:ReferenceDate>` +
    `<cbc:IssueDate>${rc.fechaGeneracion}</cbc:IssueDate>` +
    firmaRef(rc.emisor) +
    emisorParty(rc.emisor) +
    lineas +
    `</SummaryDocuments>`
  );
}

/** Comunicación de baja (RA) — VoidedDocuments-1. */
export function construirComunicacionBaja(rb: BajaDoc): string {
  const ns = [
    'xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1"',
    `xmlns:sac="${SAC}"`,
    'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
    'xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"',
    'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"',
  ].join(" ");

  const lineas = rb.lineas
    .map((l, i) => {
      return (
        `<sac:VoidedDocumentsLine>` +
        `<cbc:LineID>${i + 1}</cbc:LineID>` +
        `<cbc:DocumentTypeCode>${l.tipoDoc}</cbc:DocumentTypeCode>` +
        `<sac:DocumentSerialID>${esc(l.serie)}</sac:DocumentSerialID>` +
        `<sac:DocumentNumberID>${esc(l.correlativo)}</sac:DocumentNumberID>` +
        `<sac:VoidReasonDescription>${esc(l.motivo)}</sac:VoidReasonDescription>` +
        `</sac:VoidedDocumentsLine>`
      );
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` +
    `<VoidedDocuments ${ns}>` +
    EXT +
    `<cbc:UBLVersionID>2.0</cbc:UBLVersionID>` +
    `<cbc:CustomizationID>1.0</cbc:CustomizationID>` +
    `<cbc:ID>${esc(rb.id)}</cbc:ID>` +
    `<cbc:ReferenceDate>${rb.fechaReferencia}</cbc:ReferenceDate>` +
    `<cbc:IssueDate>${rb.fechaGeneracion}</cbc:IssueDate>` +
    firmaRef(rb.emisor) +
    emisorParty(rb.emisor) +
    lineas +
    `</VoidedDocuments>`
  );
}
