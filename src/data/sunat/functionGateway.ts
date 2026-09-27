import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { SunatGateway, SunatResult } from "./gateway";
import type { Comprobante } from "../model";

/**
 * Gateway real: emite el comprobante llamando a la Edge Function `sunat-emitir`,
 * que firma el UBL y lo envía a SUNAT (beta por defecto). Se activa con
 * VITE_SUNAT_MODE=beta; en otro caso se usa el stub.
 */
const KNOWN_RATES = [0.18, 0.12, 0.105, 0.1];

/** Tasa del comprobante a partir de sus montos, ajustada a la tasa legal más cercana. */
export function rateOf(c: Pick<Comprobante, "subtotal" | "igv">): number {
  if (!c.subtotal) return 0.18;
  const r = c.igv / c.subtotal;
  return KNOWN_RATES.reduce((best, k) => (Math.abs(k - r) < Math.abs(best - r) ? k : best), 0.18);
}

export function makeFunctionGateway(sb: SupabaseClient<Database>, tenantId?: string): SunatGateway {
  return {
    async submit(c: Comprobante): Promise<SunatResult> {
      const tipo = c.tipo === "Factura" ? "01" : c.tipo === "NotaCredito" ? "07" : "03";
      const body: Record<string, unknown> = {
        // El emisor y las credenciales se resuelven en el servidor a partir del
        // tenant (business_settings + fiscal_credentials); aquí solo el id.
        tenantId,
        tipo,
        folio: c.folio,
        buyerRuc: c.buyerRuc,
        buyerName: c.buyerName,
        subtotal: c.subtotal,
        igv: c.igv,
        total: c.total,
        // Tasa del comprobante (18 % general o la reducida MYPE restaurante).
        igvTasa: rateOf(c),
      };
      if (c.tipo === "NotaCredito") {
        body.refFolio = c.refFolio ?? "";
        body.refTipo = (c.refFolio ?? "").startsWith("F") ? "01" : "03";
        body.motivo = c.motivo ?? "Anulación de la operación";
        body.motivoCodigo = "01";
      }
      const { data, error } = await sb.functions.invoke("sunat-emitir", { body });
      // Error de transporte (red/función caída): transitorio, conviene reintentar.
      if (error) return { accepted: false, error: error.message, transient: true };
      const res = data as {
        accepted?: boolean;
        description?: string;
        error?: string;
        code?: string;
        cdr?: string;
        xml?: string;
        pdfUrl?: string;
        xmlUrl?: string;
        qr?: string;
      };
      // Excepción del servidor (500): transitorio.
      if (res.error) return { accepted: false, error: res.error, transient: true };
      if (res.accepted) {
        return {
          accepted: true,
          code: res.code,
          signedXml: res.xml,
          cdr: res.cdr,
          pdfUrl: res.pdfUrl,
          xmlUrl: res.xmlUrl,
          qr: res.qr,
        };
      }
      // No aceptado: 'unknown' = respuesta no reconocida del WS (transitorio);
      // cualquier otro código es un rechazo de negocio (definitivo).
      const transient = res.code === "unknown" || !res.code;
      return { accepted: false, error: res.description, code: res.code, transient, signedXml: res.xml };
    },
  };
}
