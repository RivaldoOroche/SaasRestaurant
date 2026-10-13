import { supabase, USE_MOCK } from "@/lib/supabase";
import { MockRepo } from "./mock/MockRepo";
import type { ComedorMenuDay, PortalFamilia } from "./model";

/**
 * Portal de familias del comedor: lo que ve el padre o la madre con su enlace
 * privado (sin cuenta). En el demo, el estado vive en este navegador.
 */
const mock = () => USE_MOCK || !supabase;
const demo = () => new MockRepo("comedor");

export async function getPortalFamilia(token: string): Promise<PortalFamilia | null> {
  if (mock()) return demo().getPortalFamilia(token);
  const { data, error } = await supabase!.rpc("public_familia", { p_token: token });
  if (error || !data) return null;
  const r = data as {
    tenant_name: string;
    responsable: string;
    yape: string | null;
    plin: string | null;
    cierre_reservas: string;
    saldo_minimo: number | string;
    categories: { id: string; name: string }[];
    menus: (Omit<ComedorMenuDay, "price"> & { price: number | string })[];
    comensales: {
      id: string;
      name: string;
      grupo: string;
      plan: PortalFamilia["comensales"][number]["plan"];
      abono_hasta: string | null;
      balance: number | string;
      daily_limit: number | string | null;
      blocked_category_ids: string[];
      allergies: string;
      reservas: string[];
      consumos: { date: string; at: string; detail: string; total: number | string; pago: string }[];
      recargas: { at: string; amount: number | string; method: string | null; detail: string }[];
    }[];
  };
  return {
    tenantName: r.tenant_name,
    responsable: r.responsable,
    yapeNumber: r.yape,
    plinNumber: r.plin,
    cierreReservas: r.cierre_reservas,
    saldoMinimo: Number(r.saldo_minimo),
    categories: r.categories,
    menus: r.menus.map((m) => ({ ...m, price: Number(m.price) })),
    comensales: r.comensales.map((c) => ({
      id: c.id,
      name: c.name,
      grupo: c.grupo,
      plan: c.plan,
      abonoHasta: c.abono_hasta,
      balance: Number(c.balance),
      dailyLimit: c.daily_limit == null ? null : Number(c.daily_limit),
      blockedCategoryIds: c.blocked_category_ids ?? [],
      allergies: c.allergies,
      reservas: c.reservas,
      consumos: c.consumos.map((k) => ({ ...k, total: Number(k.total) })),
      recargas: c.recargas.map((w) => ({ ...w, amount: Number(w.amount) })),
    })),
  };
}

export async function portalReservar(token: string, comensalId: string, date: string, on: boolean): Promise<void> {
  if (mock()) return demo().portalReservar(token, comensalId, date, on);
  const { error } = await supabase!.rpc("public_familia_reservar", { p_token: token, p_comensal: comensalId, p_date: date, p_on: on });
  if (error) throw new Error(error.message);
}

export async function portalAjustes(
  token: string,
  comensalId: string,
  patch: { dailyLimit: number | null; blockedCategoryIds: string[]; allergies: string },
): Promise<void> {
  if (mock()) return demo().portalAjustes(token, comensalId, patch);
  const { error } = await supabase!.rpc("public_familia_ajustes", {
    p_token: token,
    p_comensal: comensalId,
    p_daily_limit: patch.dailyLimit,
    p_blocked: patch.blockedCategoryIds,
    p_allergies: patch.allergies,
  });
  if (error) throw new Error(error.message);
}
