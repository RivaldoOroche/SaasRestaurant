// Impuestos a las ventas en Perú (IGV + IPM), en un solo lugar.
//
// Regla de precios: los precios de la carta YA INCLUYEN el impuesto. El Código
// de Protección y Defensa del Consumidor (Ley 29571) exige mostrar el precio
// total final, con impuestos; por eso el POS nunca suma IGV "encima": desglosa
// base imponible (op. gravada) e IGV desde el total.
//
// Tasas (IGV + IPM, como las informa el comprobante electrónico):
//   · Régimen general: 18 %.
//   · MYPE de restaurantes, hoteles y alojamientos turísticos (Ley 31556,
//     prorrogada por Ley 32219; IPM según Ley 32387): 10 % en 2025,
//     10,5 % en 2026 y 12 % en 2027. Requisitos: MYPE (ventas ≤ 1700 UIT) y
//     que la actividad sea al menos el 70 % de sus ingresos. Fuera de esa
//     vigencia se vuelve a la tasa general.
import { round2 } from "./money";

export type TaxRegime = "general" | "mype_restaurante";

export const GENERAL_RATE = 18;

/** Tasa total (IGV+IPM, en %) del régimen especial MYPE por año. */
export const MYPE_RESTAURANT_RATES: Record<number, number> = { 2025: 10, 2026: 10.5, 2027: 12 };

export const TAX_REGIME_LABEL: Record<TaxRegime, string> = {
  general: "Régimen general (18 %)",
  mype_restaurante: "MYPE restaurante — tasa reducida (Ley 31556 / 32219)",
};

/**
 * Tasa vigente en % para una fecha. En régimen general se respeta la tasa
 * configurada (por defecto 18); en el especial se toma la del año y, si la
 * norma ya no está vigente, la general.
 */
export function effectiveRate(regime: TaxRegime | undefined, configuredRate: number, at: Date = new Date()): number {
  if (regime === "mype_restaurante") return MYPE_RESTAURANT_RATES[at.getFullYear()] ?? GENERAL_RATE;
  return configuredRate;
}

/** Desglose de un total con impuesto incluido: base imponible + impuesto. */
export function splitIncluded(total: number, ratePct: number): { base: number; tax: number } {
  const base = round2(total / (1 + ratePct / 100));
  return { base, tax: round2(total - base) };
}

/** "10.5" → "10,5 %" (formato peruano). */
export function formatRate(ratePct: number): string {
  return `${String(ratePct).replace(".", ",")} %`;
}
