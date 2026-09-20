import { describe, it, expect } from "vitest";
import { numeroALetras } from "./numeroALetras.ts";
import { construirUBL, calcularTotales } from "./ubl.ts";
import { construirNotaCredito } from "./notaCredito.ts";
import { construirResumenDiario, construirComunicacionBaja } from "./lotes.ts";
import { zipStore } from "./zip.ts";
import { firmarUBL } from "./sign.ts";
import type { Comprobante } from "./types.ts";

const COMP: Comprobante = {
  tipo: "01",
  serie: "F001",
  correlativo: "123",
  fechaEmision: "2026-09-20",
  horaEmision: "12:30:00",
  moneda: "PEN",
  igvTasa: 0.18,
  emisor: { ruc: "20000000001", razonSocial: "LA HIGUERA SAC", direccion: "Av. La Mar 1234, Miraflores", ubigeo: "150122" },
  cliente: { tipoDoc: "6", numDoc: "20512345678", nombre: "CONTOSO SAC" },
  items: [
    { descripcion: "Ceviche clásico", cantidad: 2, valorUnitario: 42 },
    { descripcion: "Pisco sour", cantidad: 1, valorUnitario: 26 },
  ],
};

describe("numeroALetras", () => {
  it("formatea con céntimos", () => {
    expect(numeroALetras(130.2)).toBe("CIENTO TREINTA CON 20/100");
    expect(numeroALetras(1)).toBe("UNO CON 00/100");
    expect(numeroALetras(0)).toBe("CERO CON 00/100");
    expect(numeroALetras(100)).toBe("CIEN CON 00/100");
    expect(numeroALetras(21)).toBe("VEINTIUNO CON 00/100");
    expect(numeroALetras(1500.5)).toBe("MIL QUINIENTOS CON 50/100");
  });
});

describe("calcularTotales", () => {
  it("suma gravado + IGV 18%", () => {
    // 42*2 + 26 = 110 ; IGV 19.80 ; total 129.80
    const t = calcularTotales(COMP);
    expect(t.valorVenta).toBe(110);
    expect(t.igv).toBe(19.8);
    expect(t.total).toBe(129.8);
  });
});

describe("construirUBL", () => {
  const xml = construirUBL(COMP, numeroALetras(129.8));
  it("incluye datos clave y ExtensionContent vacío para firmar", () => {
    expect(xml).toContain("<cbc:ID>F001-123</cbc:ID>");
    expect(xml).toContain('<cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">129.80</cbc:PayableAmount>');
    expect(xml).toContain("<ext:ExtensionContent></ext:ExtensionContent>");
    expect(xml).toContain("CIENTO VEINTINUEVE CON 80/100");
    // dos líneas
    expect((xml.match(/<cac:InvoiceLine>/g) || []).length).toBe(2);
  });
});

describe("construirNotaCredito", () => {
  const xml = construirNotaCredito(
    COMP,
    { tipoDocRef: "01", folioRef: "F001-100", motivoCodigo: "01", motivo: "Anulación de la operación" },
    numeroALetras(129.8),
  );
  it("emite CreditNote con motivo y documento afectado", () => {
    expect(xml).toContain("<CreditNote ");
    expect(xml).toContain("<cbc:ID>F001-123</cbc:ID>");
    expect(xml).toContain("<cbc:ResponseCode>01</cbc:ResponseCode>");
    expect(xml).toContain("<cbc:ReferenceID>F001-100</cbc:ReferenceID>");
    expect(xml).toContain("<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>");
    expect(xml).toContain("Anulación de la operación");
    expect(xml).toContain("<ext:ExtensionContent></ext:ExtensionContent>");
    // dos líneas de crédito
    expect((xml.match(/<cac:CreditNoteLine>/g) || []).length).toBe(2);
    expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">129.80</cbc:PayableAmount>');
  });
});

describe("construirResumenDiario", () => {
  const xml = construirResumenDiario({
    id: "RC-20260920-1",
    fechaReferencia: "2026-09-20",
    fechaGeneracion: "2026-09-21",
    emisor: { ruc: "20000000001", razonSocial: "LA HIGUERA SAC", direccion: "Av. La Mar 1234" },
    lineas: [
      { tipoDoc: "03", serie: "B001", correlativo: "1001", clienteTipoDoc: "1", clienteNumDoc: "45678912", gravado: 100, igv: 18, total: 118 },
      { tipoDoc: "03", serie: "B001", correlativo: "1002", clienteTipoDoc: "0", clienteNumDoc: "-", gravado: 50, igv: 9, total: 59, estado: "3" },
    ],
  });
  it("emite SummaryDocuments con líneas y ExtensionContent vacío", () => {
    expect(xml).toContain("<SummaryDocuments ");
    expect(xml).toContain("<cbc:ID>RC-20260920-1</cbc:ID>");
    expect(xml).toContain("<cbc:ReferenceDate>2026-09-20</cbc:ReferenceDate>");
    expect(xml).toContain("<ext:ExtensionContent></ext:ExtensionContent>");
    expect((xml.match(/<sac:SummaryDocumentsLine>/g) || []).length).toBe(2);
    expect(xml).toContain("<cbc:ConditionCode>3</cbc:ConditionCode>");
  });
});

describe("construirComunicacionBaja", () => {
  const xml = construirComunicacionBaja({
    id: "RA-20260920-1",
    fechaReferencia: "2026-09-20",
    fechaGeneracion: "2026-09-20",
    emisor: { ruc: "20000000001", razonSocial: "LA HIGUERA SAC", direccion: "Av. La Mar 1234" },
    lineas: [{ tipoDoc: "01", serie: "F001", correlativo: "1001", motivo: "Error en el monto" }],
  });
  it("emite VoidedDocuments con la línea a dar de baja", () => {
    expect(xml).toContain("<VoidedDocuments ");
    expect(xml).toContain("<cbc:ID>RA-20260920-1</cbc:ID>");
    expect(xml).toContain("<sac:DocumentSerialID>F001</sac:DocumentSerialID>");
    expect(xml).toContain("<sac:DocumentNumberID>1001</sac:DocumentNumberID>");
    expect(xml).toContain("Error en el monto");
    expect(xml).toContain("<ext:ExtensionContent></ext:ExtensionContent>");
  });
});

describe("zipStore", () => {
  it("produce un ZIP válido (firma local PK\\x03\\x04)", () => {
    const z = zipStore("F001-123.xml", new TextEncoder().encode("<x/>"));
    expect(z[0]).toBe(0x50);
    expect(z[1]).toBe(0x4b);
    expect(z[2]).toBe(0x03);
    expect(z[3]).toBe(0x04);
    expect(z.length).toBeGreaterThan(50);
  });
});

describe("firmarUBL", () => {
  it("firma e inserta ds:Signature verificable", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
    const pem =
      "-----BEGIN PRIVATE KEY-----\n" +
      (btoa(String.fromCharCode(...new Uint8Array(pkcs8))).match(/.{1,64}/g) || []).join("\n") +
      "\n-----END PRIVATE KEY-----";

    const xml = construirUBL(COMP, numeroALetras(129.8));
    const signed = await firmarUBL(xml, {
      privateKeyPem: pem,
      certificatePem: "-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----",
    });

    // La firma quedó dentro de ExtensionContent
    expect(signed).toContain("<ext:ExtensionContent><ds:Signature");
    expect(signed).not.toContain("<ext:ExtensionContent></ext:ExtensionContent>");

    // Verificar SignatureValue sobre SignedInfo con la llave pública
    const signedInfo = signed.match(/<ds:SignedInfo[\s\S]*?<\/ds:SignedInfo>/)![0];
    const sigVal = signed.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/)![1];
    const sigBytes = Uint8Array.from(atob(sigVal), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      pair.publicKey,
      sigBytes,
      new TextEncoder().encode(signedInfo),
    );
    expect(ok).toBe(true);
  });
});
