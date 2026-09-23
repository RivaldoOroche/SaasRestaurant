import type { Comprobante } from "../model";

export interface SunatResult {
  accepted: boolean;
  error?: string;
  signedXml?: string; // XML UBL firmado (si el gateway lo devuelve)
  cdr?: string; // CDR de SUNAT (base64 del ZIP)
  pdfUrl?: string; // enlace al PDF (proveedores tipo Nubefact)
  xmlUrl?: string; // enlace al XML (proveedores tipo Nubefact)
  qr?: string; // cadena para el código QR
}

/**
 * Seam for real SUNAT electronic-invoicing (PSE/OSE timbrado). Swap this stub
 * for a real gateway (edge function calling the OSE) without touching the UI or
 * the repos. The stub validates the RUC shape and "accepts" everything else.
 */
export interface SunatGateway {
  submit(c: Comprobante): Promise<SunatResult>;
}

export const stubSunatGateway: SunatGateway = {
  async submit(c) {
    // A Peruvian RUC is 11 digits. Facturas require a valid buyer RUC.
    if (c.tipo === "Factura") {
      const ruc = (c.buyerRuc ?? "").replace(/\D/g, "");
      if (ruc.length !== 11) {
        return { accepted: false, error: "RUC inválido (debe tener 11 dígitos)" };
      }
    }
    return { accepted: true };
  },
};
