// Catálogo de planes: fuente única en el cliente (espejo de subscription_plans
// del seed). Con Supabase, precios y límites vienen de la BD y esto es solo el
// valor por defecto; en el modo demo es la fuente de verdad.
import type { PlanTier } from "@/types/database";

export interface PlanInfo {
  tier: PlanTier;
  /** Precio mensual final en soles, IGV incluido. */
  price: number;
  /** Precio anual (paga 10 meses, usa 12). */
  annualPrice: number;
  support: string;
  /** Sucursales además de la sede principal. null = sin límite. */
  maxBranches: number | null;
  features: string;
}

/**
 * Precios alineados al mercado peruano de POS para restaurantes (2026: la
 * mayoría entre S/ 99 y S/ 149 al mes por local con facturación SUNAT). Todas
 * las funciones están en todos los planes; cambian las sucursales y el soporte,
 * así el cliente no tiene que adivinar qué módulo le falta.
 */
export const PLANS: PlanInfo[] = [
  {
    tier: "Básico",
    price: 149,
    annualPrice: 1490,
    maxBranches: 2,
    support: "Soporte por WhatsApp y correo en horario comercial",
    features: "Todas las funciones: POS, cocina, caja, delivery, inventario, recetas, reportes y comprobantes SUNAT",
  },
  {
    tier: "Pro",
    price: 349,
    annualPrice: 3490,
    maxBranches: 10,
    support: "Soporte prioritario los 7 días",
    features: "Todo lo del Básico + reportes consolidados de todas tus sucursales",
  },
  {
    tier: "Enterprise",
    price: 899,
    annualPrice: 8990,
    maxBranches: null,
    support: "Asesor dedicado y puesta en marcha asistida",
    features: "Todo lo del Pro para cadenas, sin límite de sucursales",
  },
];

/** Ahorro del pago anual frente a 12 meses. */
export function annualSavings(p: PlanInfo): number {
  return p.price * 12 - p.annualPrice;
}

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
