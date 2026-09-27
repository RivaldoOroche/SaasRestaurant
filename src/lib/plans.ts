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
  /** Sucursales incluidas en el precio (el resto se cobra aparte). null = todas. */
  includedBranches: number | null;
  /** Precio mensual por cada sucursal activa adicional (IGV incluido). */
  extraBranchPrice: number | null;
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
    includedBranches: null,
    extraBranchPrice: null,
    support: "Soporte por WhatsApp y correo en horario comercial",
    features: "Todas las funciones: POS, cocina, caja, delivery, inventario, recetas, reportes y comprobantes SUNAT",
  },
  {
    tier: "Pro",
    price: 349,
    annualPrice: 3490,
    maxBranches: 10,
    includedBranches: null,
    extraBranchPrice: null,
    support: "Soporte prioritario los 7 días",
    features: "Todo lo del Básico + reportes consolidados de todas tus sucursales",
  },
  {
    tier: "Enterprise",
    price: 899,
    annualPrice: 8990,
    maxBranches: null,
    includedBranches: 24,
    extraBranchPrice: 29,
    support: "Asesor dedicado y puesta en marcha asistida",
    features: "Todo lo del Pro para cadenas: 25 locales incluidos y S/ 29 por local adicional",
  },
];

/** Ahorro del pago anual frente a 12 meses. */
export function annualSavings(p: PlanInfo): number {
  return p.price * 12 - p.annualPrice;
}

export function planInfo(tier: string | null | undefined): PlanInfo {
  return PLANS.find((p) => p.tier === tier) ?? PLANS[1];
}

/** Precio mensual equivalente pagando anual (p. ej. S/ 1 490 → S/ 124.17). */
export function annualMonthly(p: PlanInfo): number {
  return Math.round((p.annualPrice / 12) * 100) / 100;
}

/** Sucursales activas que se cobran aparte (por encima de las incluidas). */
export function extraBranches(p: Pick<PlanInfo, "includedBranches" | "extraBranchPrice">, activeChildBranches: number): number {
  if (p.includedBranches === null || p.extraBranchPrice === null) return 0;
  return Math.max(0, activeChildBranches - p.includedBranches);
}

/** Total mensual con IGV: precio del plan + sucursales adicionales (mismo cálculo que app.plan_monthly_total). */
export function monthlyTotal(p: PlanInfo, activeChildBranches: number): number {
  return Math.round((p.price + extraBranches(p, activeChildBranches) * (p.extraBranchPrice ?? 0)) * 100) / 100;
}

/**
 * Texto corto de los locales del plan: "principal + 2 sucursales",
 * "25 locales incluidos + S/ 29 por local adicional". Acepta el plan o solo
 * el tope (compatibilidad).
 */
export function branchLimitLabel(plan: Pick<PlanInfo, "maxBranches" | "includedBranches" | "extraBranchPrice"> | number | null): string {
  const p = typeof plan === "object" && plan !== null ? plan : { maxBranches: plan, includedBranches: null, extraBranchPrice: null };
  if (p.includedBranches !== null && p.extraBranchPrice !== null) {
    return `${p.includedBranches + 1} locales incluidos + S/ ${p.extraBranchPrice} por local adicional`;
  }
  if (p.maxBranches === null) return "sucursales ilimitadas";
  return `principal + ${p.maxBranches} ${p.maxBranches === 1 ? "sucursal" : "sucursales"}`;
}

/** Mismo mensaje que el trigger branches_quota_guard. */
export function quotaExceededMessage(tier: string, maxBranches: number): string {
  return `Tu plan ${tier} permite la sede principal y hasta ${maxBranches} sucursales. Mejora tu plan para agregar más.`;
}
