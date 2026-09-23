import { supabase, USE_MOCK } from "@/lib/supabase";

export interface PublicTenantInfo {
  tenantName: string;
  ruc?: string;
  razonSocial?: string;
  address?: string;
}

export interface ComplaintPayload {
  consumer_name: string;
  consumer_doc_type: string;
  consumer_doc: string;
  consumer_address?: string;
  consumer_phone?: string;
  consumer_email?: string;
  is_minor?: boolean;
  item_type: string;
  item_amount?: number;
  item_description?: string;
  claim_type: string;
  detail: string;
  request?: string;
}

/** Datos públicos del emisor para encabezar la hoja de reclamación. */
export async function getPublicTenantInfo(slug: string): Promise<PublicTenantInfo | null> {
  if (USE_MOCK || !supabase) {
    return { tenantName: "La Higuera", ruc: "20512345678", razonSocial: "La Higuera S.A.C.", address: "Av. Demo 123, Miraflores, Lima" };
  }
  const { data, error } = await supabase.rpc("public_tenant_info", { p_slug: slug });
  if (error || !data) return null;
  const d = data as { tenant_name: string; ruc: string | null; razon_social: string | null; address: string | null };
  return { tenantName: d.tenant_name, ruc: d.ruc ?? undefined, razonSocial: d.razon_social ?? undefined, address: d.address ?? undefined };
}

/** Envía una hoja de reclamación (pública). Devuelve el correlativo asignado. */
export async function submitComplaint(slug: string, payload: ComplaintPayload): Promise<{ correlativo?: number; error?: string }> {
  if (USE_MOCK || !supabase) {
    await new Promise((r) => setTimeout(r, 400));
    return { correlativo: Math.floor(100 + Math.random() * 900) };
  }
  const { data, error } = await supabase.rpc("submit_complaint", { p_slug: slug, payload });
  if (error) return { error: error.message };
  const r = (data ?? {}) as { correlativo?: number; error?: string };
  return r.error ? { error: r.error } : { correlativo: r.correlativo };
}
