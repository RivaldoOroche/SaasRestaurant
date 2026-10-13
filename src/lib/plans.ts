// Catálogo de planes: fuente única en el cliente (espejo de subscription_plans
// del seed). Con Supabase, precios y límites vienen de la BD y esto es solo el
// valor por defecto; en el modo demo es la fuente de verdad.
import type { PlanTier } from "@/types/database";
import type { BusinessType } from "./comedor";

export interface PlanInfo {
  tier: PlanTier;
  /** Restaurante o comedor: cada negocio solo puede tomar planes de su tipo. */
  businessType: BusinessType;
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
  /** Comedor: tope de comensales activos (null = sin tope). */
  maxComensales?: number | null;
  /** Comedor: comensales incluidos en el precio (null = todos los permitidos). */
  includedComensales?: number | null;
  /** Comedor: precio mensual por cada 100 comensales activos adicionales. */
  extraComensalesPrice?: number | null;
}

/**
 * Pensado para la realidad peruana: casi todos los restaurantes tienen un solo
 * local y muy pocos pasan de 4 (ver PRECIOS.md). Todas las funciones en todos
 * los planes; cambia cuántos locales incluye y el soporte. Precios con IGV.
 */
export const PLANS: PlanInfo[] = [
  {
    tier: "Básico",
    businessType: "restaurante",
    price: 159,
    annualPrice: 1590,
    maxBranches: 0,
    includedBranches: null,
    extraBranchPrice: null,
    support: "Soporte por WhatsApp los 7 días, en horario de restaurantes",
    features: "Todo para un local: POS, cocina, caja, delivery, inventario, recetas, reportes y comprobantes SUNAT (Wayra no cobra por comprobante)",
  },
  {
    tier: "Pro",
    businessType: "restaurante",
    price: 299,
    annualPrice: 2990,
    maxBranches: 4,
    includedBranches: 1,
    extraBranchPrice: 119,
    support: "Soporte prioritario los 7 días y puesta en marcha guiada",
    features: "Todo lo del Básico para 2 locales (hasta 5): reportes consolidados, traslados de insumos y personal por local",
  },
  {
    tier: "Enterprise",
    businessType: "restaurante",
    price: 899,
    annualPrice: 8990,
    maxBranches: null,
    includedBranches: 5,
    extraBranchPrice: 99,
    support: "Asesor dedicado y puesta en marcha asistida en cada local",
    features: "Para cadenas: 6 locales incluidos, S/ 99 por local adicional y asesor dedicado",
  },
  // Comedores de colegios y empresas: se cobra por comensales activos (ver
  // PRECIOS.md). El pago anual de 10 meses calza con el año escolar.
  {
    tier: "Comedor",
    businessType: "comedor",
    price: 249,
    annualPrice: 2490,
    maxBranches: 0,
    includedBranches: null,
    extraBranchPrice: null,
    maxComensales: 300,
    includedComensales: null,
    extraComensalesPrice: null,
    support: "Carga del padrón incluida y soporte por WhatsApp en horario escolar",
    features:
      "Un comedor o cafetería con hasta 300 comensales activos: despacho, monedero prepago, abonos, menú del día con reservas, kiosko saludable, portal de familias y comprobantes SUNAT",
  },
  {
    tier: "Comedor Pro",
    businessType: "comedor",
    price: 449,
    annualPrice: 4490,
    maxBranches: 2,
    includedBranches: null,
    extraBranchPrice: null,
    maxComensales: 1000,
    includedComensales: null,
    extraComensalesPrice: null,
    support: "Soporte prioritario y capacitación al personal de cada sede",
    features: "Hasta 1 000 comensales activos y 3 sedes: todo lo del plan Comedor, convenios, reportes por sede y soporte prioritario",
  },
  {
    tier: "Comedor Institucional",
    businessType: "comedor",
    price: 899,
    annualPrice: 8990,
    maxBranches: null,
    includedBranches: null,
    extraBranchPrice: null,
    maxComensales: null,
    includedComensales: 2000,
    extraComensalesPrice: 35,
    support: "Asesor dedicado y puesta en marcha asistida en cada sede",
    features: "Para redes de colegios, universidades y empresas: 2 000 comensales incluidos, S/ 35 por cada 100 adicionales y sedes ilimitadas",
  },
];

/** Planes que puede tomar un tipo de negocio. */
export function plansFor(type: BusinessType | undefined): PlanInfo[] {
  return PLANS.filter((p) => p.businessType === (type ?? "restaurante"));
}

/** Bloques de 100 comensales que se cobran aparte (mismo cálculo que app.plan_extra_comensal_blocks). */
export function extraComensalBlocks(p: Pick<PlanInfo, "includedComensales" | "extraComensalesPrice">, activeComensales: number): number {
  if (p.includedComensales == null || p.extraComensalesPrice == null) return 0;
  return Math.ceil(Math.max(0, activeComensales - p.includedComensales) / 100);
}

/** Texto corto de los comensales del plan. */
export function comensalLimitLabel(p: Pick<PlanInfo, "maxComensales" | "includedComensales" | "extraComensalesPrice">): string {
  if (p.includedComensales != null && p.extraComensalesPrice != null)
    return `${p.includedComensales.toLocaleString("es-PE")} comensales incluidos + S/ ${p.extraComensalesPrice} por cada 100 adicionales`;
  if (p.maxComensales == null) return "comensales ilimitados";
  return `hasta ${p.maxComensales.toLocaleString("es-PE")} comensales activos`;
}

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
export function monthlyTotal(p: PlanInfo, activeChildBranches: number, activeComensales = 0): number {
  const branches = extraBranches(p, activeChildBranches) * (p.extraBranchPrice ?? 0);
  const comensales = extraComensalBlocks(p, activeComensales) * (p.extraComensalesPrice ?? 0);
  return Math.round((p.price + branches + comensales) * 100) / 100;
}

/**
 * Texto corto de los locales del plan: "1 local",
 * "2 locales incluidos + S/ 119 por local adicional (hasta 5)". Acepta el plan
 * o solo el tope (compatibilidad).
 */
export function branchLimitLabel(plan: Pick<PlanInfo, "maxBranches" | "includedBranches" | "extraBranchPrice"> | number | null): string {
  const p = typeof plan === "object" && plan !== null ? plan : { maxBranches: plan, includedBranches: null, extraBranchPrice: null };
  if (p.maxBranches === 0) return "1 local";
  if (p.includedBranches !== null && p.extraBranchPrice !== null) {
    const cap = p.maxBranches !== null ? ` (hasta ${p.maxBranches + 1})` : "";
    return `${p.includedBranches + 1} locales incluidos + S/ ${p.extraBranchPrice} por local adicional${cap}`;
  }
  if (p.maxBranches === null) return "locales ilimitados";
  return `hasta ${p.maxBranches + 1} locales`;
}

/** Mismo mensaje que el trigger branches_quota_guard. */
export function quotaExceededMessage(tier: string, maxBranches: number): string {
  if (maxBranches === 0) return `Tu plan ${tier} es para un solo local. Pasa al plan Pro para agregar sucursales.`;
  return `Tu plan ${tier} permite hasta ${maxBranches + 1} locales (la sede principal y ${maxBranches} sucursales). Mejora tu plan para agregar más.`;
}
