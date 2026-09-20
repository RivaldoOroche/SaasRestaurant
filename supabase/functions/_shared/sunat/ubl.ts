// Genera el XML UBL 2.1 de una Factura/Boleta electrónica para SUNAT.
// El <ext:ExtensionContent> queda vacío: la firma se inyecta ahí en sign.ts.
// Se emite ya en forma canónica (sin espacios entre nodos, atributos en orden
// fijo, namespaces en la raíz) para que la firma enveloped sea determinista.

import type { Comprobante, Totales } from "./types.ts";

const NS = [
  'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
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

export function calcularTotales(c: Comprobante): Totales {
  const tasa = c.igvTasa ?? 0.18;
  let valorVenta = 0;
  for (const it of c.items) valorVenta += it.valorUnitario * it.cantidad;
  valorVenta = round2(valorVenta);
  const igv = round2(valorVenta * tasa);
  return { valorVenta, igv, total: round2(valorVenta + igv) };
}

/** Construye el XML UBL con ExtensionContent vacío (listo para firmar). */
export function construirUBL(c: Comprobante, importeEnLetras: string): string {
  const tasa = c.igvTasa ?? 0.18;
  const moneda = c.moneda ?? "PEN";
  const hora = c.horaEmision ?? "00:00:00";
  const id = `${c.serie}-${c.correlativo}`;
  const t = calcularTotales(c);

  const lineas = c.items
    .map((it, i) => {
      const cantidad = it.cantidad;
      const unidad = it.unidad ?? "NIU";
      const valorVentaLinea = round2(it.valorUnitario * cantidad);
      const igvLinea = round2(valorVentaLinea * tasa);
      const precioConIgv = round2(it.valorUnitario * (1 + tasa));
      return (
        `<cac:InvoiceLine>` +
        `<cbc:ID>${i + 1}</cbc:ID>` +
        `<cbc:InvoicedQuantity unitCode="${unidad}">${cantidad}</cbc:InvoicedQuantity>` +
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
        `</cac:InvoiceLine>`
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
    `<Invoice ${NS}>` +
    `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>` +
    `<cbc:UBLVersionID>2.1</cbc:UBLVersionID>` +
    `<cbc:CustomizationID>2.0</cbc:CustomizationID>` +
    `<cbc:ID>${id}</cbc:ID>` +
    `<cbc:IssueDate>${c.fechaEmision}</cbc:IssueDate>` +
    `<cbc:IssueTime>${hora}</cbc:IssueTime>` +
    `<cbc:InvoiceTypeCode listID="0101">${c.tipo}</cbc:InvoiceTypeCode>` +
    `<cbc:Note languageLocaleID="1000">${esc(importeEnLetras)}</cbc:Note>` +
    `<cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>` +
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
    `</Invoice>`
  );
}
