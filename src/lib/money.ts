/** Currency + tax helpers. Defaults to Peruvian soles / IGV 18% per the localized prototype. */
export type Currency = "PEN" | "USD" | "EUR";

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  PEN: "S/",
  USD: "$",
  EUR: "€",
};

export const DEFAULT_TAX_RATE = 0.18; // IGV

/** Formats an amount with the tenant's currency symbol, es-PE grouping. */
export function formatMoney(amount: number, currency: Currency = "PEN"): string {
  const n = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${CURRENCY_SYMBOL[currency]} ${n}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
