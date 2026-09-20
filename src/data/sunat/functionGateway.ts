import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { SunatGateway, SunatResult } from "./gateway";
import type { Comprobante } from "../model";

/**
 * Gateway real: emite el comprobante llamando a la Edge Function `sunat-emitir`,
 * que firma el UBL y lo envía a SUNAT (beta por defecto). Se activa con
 * VITE_SUNAT_MODE=beta; en otro caso se usa el stub.
 */
export function makeFunctionGateway(sb: SupabaseClient<Database>): SunatGateway {
  return {
    async submit(c: Comprobante): Promise<SunatResult> {
      const tipo = c.tipo === "Factura" ? "01" : c.tipo === "NotaCredito" ? "07" : "03";
      const body: Record<string, unknown> = {
        tipo,
        folio: c.folio,
        buyerRuc: c.buyerRuc,
        buyerName: c.buyerName,
        subtotal: c.subtotal,
        igv: c.igv,
        total: c.total,
      };
      if (c.tipo === "NotaCredito") {
        body.refFolio = c.refFolio ?? "";
        body.refTipo = (c.refFolio ?? "").startsWith("F") ? "01" : "03";
        body.motivo = c.motivo ?? "Anulación de la operación";
        body.motivoCodigo = "01";
      }
      const { data, error } = await sb.functions.invoke("sunat-emitir", { body });
      if (error) return { accepted: false, error: error.message };
      const res = data as { accepted?: boolean; description?: string; error?: string };
      if (res.error) return { accepted: false, error: res.error };
      return { accepted: !!res.accepted, error: res.accepted ? undefined : res.description };
    },
  };
}
