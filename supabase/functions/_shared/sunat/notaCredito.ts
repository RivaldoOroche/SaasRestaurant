// Genera el XML UBL 2.1 de una Nota de Crédito electrónica (SUNAT tipo 07).
// Igual que la Factura/Boleta, el <ext:ExtensionContent> queda vacío para que
// sign.ts inyecte la firma enveloped. Se emite en forma canónica.

import type { Comprobante, NotaCreditoRef, Totales } from "./types.ts";
import { calcularTotales } from "./ubl.ts";

const NS = [
  'xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
  'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
  'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
  'xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"',
  'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"',
].join(" ");

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

/** Construye el XML UBL de la Nota de Crédito con ExtensionContent vacío. */
export function construirNotaCredito(c: Comprobante, ref: NotaCreditoRef, importeEnLetras: string): string {
  const tasa = c.igvTasa ?? 0.18;
  const moneda = c.moneda ?? "PEN";
  const hora = c.horaEmision ?? "00:00:00";
  const id = `${c.serie}-${c.correlativo}`;
  const motivoCod = ref.motivoCodigo ?? "01";
  const t: Totales = calcularTotales(c);

  const lineas = c.items
    .map((it, i) => {
      const cantidad = it.cantidad;
      const unidad = it.unidad ?? "NIU";
      const valorVentaLinea = round2(it.valorUnitario * cantidad);
      const igvLinea = round2(valorVentaLinea * tasa);
      const precioConIgv = round2(it.valorUnitario * (1 + tasa));
      return (
        `<cac:CreditNoteLine>` +
        `<cbc:ID>${i + 1}</cbc:ID>` +
        `<cbc:CreditedQuantity unitCode="${unidad}">${cantidad}</cbc:CreditedQuantity>` +
        `<cbc:LineExtensionAmount currencyID="${moneda}">${n2(valorVentaLinea)}</cbc:LineExtensionAmount>` +
        `<cac:PricingReference><cac:AlternativeConditionPrice>` +
        `<cbc:PriceAmount currencyID="${moneda}">${n2(precioConIgv)}</cbc:PriceAmount>` +
        `<cbc:PriceTypeCode>01</cbc:PriceTypeCode>` +
        `</cac:AlternativeConditionPrice></cac:PricingReference>` +
        `<cac:TaxTotal>` +
        `<cbc:TaxAmount currencyID="${moneda}">${n2(igvLinea)}</cbc:TaxAmount>` +
        `<cac:TaxSubtotal>` +
        `<cbc:TaxableAmount currencyID="${moneda}">${n2(valorVentaLinea)}</cbc:TaxableAmount>` +
        `<cbc:TaxAmount currencyID="${moneda}">${n2(igvLinea)}</cbc:TaxAmount>` +
        `<cac:TaxCategory>` +
        `<cbc:Percent>${(tasa * 100).toFixed(0)}</cbc:Percent>` +
        `<cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>` +
        `<cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme>` +
        `</cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>` +
        `<cac:Item><cbc:Description>${esc(it.descripcion)}</cbc:Description></cac:Item>` +
        `<cac:Price><cbc:PriceAmount currencyID="${moneda}">${n2(it.valorUnitario)}</cbc:PriceAmount></cac:Price>` +
        `</cac:CreditNoteLine>`
      );
    })
    .join("");

  const clienteDoc =
    c.cliente.tipoDoc === "-"
      ? ""
      : `<cbc:CustomerAssignedAccountID>${esc(c.cliente.numDoc)}</cbc:CustomerAssignedAccountID>` +
        `<cbc:AdditionalAccountID>${c.cliente.tipoDoc}</cbc:AdditionalAccountID>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` +
    `<CreditNote ${NS}>` +
    `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>` +
    `<cbc:UBLVersionID>2.1</cbc:UBLVersionID>` +
    `<cbc:CustomizationID>2.0</cbc:CustomizationID>` +
    `<cbc:ID>${id}</cbc:ID>` +
    `<cbc:IssueDate>${c.fechaEmision}</cbc:IssueDate>` +
    `<cbc:IssueTime>${hora}</cbc:IssueTime>` +
    `<cbc:Note languageLocaleID="1000">${esc(importeEnLetras)}</cbc:Note>` +
    `<cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>` +
    // Motivo / sustento de la nota de crédito (catálogo 09).
    `<cac:DiscrepancyResponse>` +
    `<cbc:ReferenceID>${esc(ref.folioRef)}</cbc:ReferenceID>` +
    `<cbc:ResponseCode>${motivoCod}</cbc:ResponseCode>` +
    `<cbc:Description>${esc(ref.motivo)}</cbc:Description>` +
    `</cac:DiscrepancyResponse>` +
    // Documento afectado.
    `<cac:BillingReference><cac:InvoiceDocumentReference>` +
    `<cbc:ID>${esc(ref.folioRef)}</cbc:ID>` +
    `<cbc:DocumentTypeCode>${ref.tipoDocRef}</cbc:DocumentTypeCode>` +
    `</cac:InvoiceDocumentReference></cac:BillingReference>` +
    `<cac:Signature>` +
    `<cbc:ID>${esc(c.emisor.ruc)}</cbc:ID>` +
    `<cac:SignatoryParty><cac:PartyIdentification><cbc:ID>${esc(c.emisor.ruc)}</cbc:ID></cac:PartyIdentification>` +
    `<cac:PartyName><cbc:Name>${esc(c.emisor.razonSocial)}</cbc:Name></cac:PartyName></cac:SignatoryParty>` +
    `<cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#Sign</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment>` +
    `</cac:Signature>` +
    `<cac:AccountingSupplierParty>` +
    `<cbc:CustomerAssignedAccountID>${esc(c.emisor.ruc)}</cbc:CustomerAssignedAccountID>` +
    `<cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>` +
    `<cac:Party><cac:PartyName><cbc:Name>${esc(c.emisor.nombreComercial ?? c.emisor.razonSocial)}</cbc:Name></cac:PartyName>` +
    `<cac:PostalAddress><cbc:StreetName>${esc(c.emisor.direccion)}</cbc:StreetName>` +
    (c.emisor.ubigeo ? `<cbc:ID>${c.emisor.ubigeo}</cbc:ID>` : "") +
    `</cac:PostalAddress>` +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(c.emisor.razonSocial)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
    `</cac:Party></cac:AccountingSupplierParty>` +
    `<cac:AccountingCustomerParty>` +
    clienteDoc +
    `<cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${esc(c.cliente.nombre)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party>` +
    `</cac:AccountingCustomerParty>` +
    `<cac:TaxTotal>` +
    `<cbc:TaxAmount currencyID="${moneda}">${n2(t.igv)}</cbc:TaxAmount>` +
    `<cac:TaxSubtotal>` +
    `<cbc:TaxableAmount currencyID="${moneda}">${n2(t.valorVenta)}</cbc:TaxableAmount>` +
    `<cbc:TaxAmount currencyID="${moneda}">${n2(t.igv)}</cbc:TaxAmount>` +
    `<cac:TaxCategory><cbc:Percent>${(tasa * 100).toFixed(0)}</cbc:Percent>` +
    `<cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme>` +
    `</cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal>` +
    `<cbc:LineExtensionAmount currencyID="${moneda}">${n2(t.valorVenta)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxInclusiveAmount currencyID="${moneda}">${n2(t.total)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount currencyID="${moneda}">${n2(t.total)}</cbc:PayableAmount>` +
    `</cac:LegalMonetaryTotal>` +
    lineas +
    `</CreditNote>`
  );
}
