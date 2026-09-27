// Catálogo de planes: fuente única en el cliente (espejo de subscription_plans
// del seed). Con Supabase, precios y límites vienen de la BD y esto es solo el
// valor por defecto; en el modo demo es la fuente de verdad.
import type { PlanTier } from "@/types/database";

export interface PlanInfo {
  tier: PlanTier;
  price: number;
  /** Sucursales además de la sede principal. null = sin límite. */
  maxBranches: number | null;
  features: string;
}

export const PLANS: PlanInfo[] = [
  { tier: "Básico", price: 699, maxBranches: 2, features: "POS, cocina, caja, delivery y comprobantes SUNAT" },
  { tier: "Pro", price: 1499, maxBranches: 10, features: "Todo lo del Básico + inventario, recetas y reportes" },
  { tier: "Enterprise", price: 4800, maxBranches: null, features: "Todo lo del Pro + soporte prioritario" },
];

export function planInfo(tier: string | null | undefined): PlanInfo {
  return PLANS.find((p) => p.tier === tier) ?? PLANS[1];
}

/** Texto corto del límite: "principal + 2 sucursales" / "sucursales ilimitadas". */
export function branchLimitLabel(maxBranches: number | null): string {
  if (maxBranches === null) return "sucursales ilimitadas";
  return `principal + ${maxBranches} ${maxBranches === 1 ? "sucursal" : "sucursales"}`;
}

/** Mismo mensaje que el trigger branches_quota_guard. */
export function quotaExceededMessage(tier: string, maxBranches: number): string {
  return `Tu plan ${tier} permite la sede principal y hasta ${maxBranches} sucursales. Mejora tu plan para agregar más.`;
}
