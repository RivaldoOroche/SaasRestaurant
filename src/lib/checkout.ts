import { round2 } from "./money";

/**
 * Checkout math, ported faithfully from the prototype but made explicit.
 *
 * Order of operations (matches the prototype, kept deliberately):
 *   discAmt = amount * discountPct        (discount on the tax-inclusive gross)
 *   netAmt  = amount - discAmt
 *   tipAmt  = netAmt * tipPct             (tip is computed on the POST-discount net)
 *   grand   = netAmt + tipAmt
 *
 * The receipt subtotal/IGV split is reverse-derived from the discounted net
 * (subtotal = netAmt / (1 + taxRate)), not scaled pro-rata from the original
 * numbers. This convention is under review for Phase 3 (see plan); Phase 1 keeps
 * it to match the prototype exactly.
 */
export interface CheckoutInput {
  /** Tax-inclusive gross (cart subtotal + IGV). */
  amount: number;
  /** IGV rate as a fraction, e.g. 0.18. */
  taxRate: number;
  /** Discount as a fraction: 0, 0.10, 0.15, or 1 (cortesía). */
  discountPct?: number;
  /** Tip as a fraction: 0, 0.10, 0.15, 0.18. */
  tipPct?: number;
  /** Loyalty points redeemed as currency (1 point = 1 currency unit). */
  redeem?: number;
}

export interface CheckoutResult {
  discAmt: number;
  netAmt: number;
  tipAmt: number;
  grand: number;
  /** Points redeemed, capped so `due` never goes negative. */
  redeemApplied: number;
  /** Amount actually owed after redemption. */
  due: number;
  /** Receipt subtotal (reverse-derived from net). */
  subtotal: number;
  /** Receipt IGV (reverse-derived from net). */
  igv: number;
  /** Loyalty points earned: 1 per 10 currency units actually paid. */
  pointsEarned: number;
}

export function computeCheckout({
  amount,
  taxRate,
  discountPct = 0,
  tipPct = 0,
  redeem = 0,
}: CheckoutInput): CheckoutResult {
  const discAmt = round2(amount * discountPct);
  const netAmt = round2(amount - discAmt);
  const tipAmt = round2(netAmt * tipPct);
  const grand = round2(netAmt + tipAmt);

  const redeemApplied = Math.max(0, Math.min(redeem, grand));
  const due = round2(Math.max(0, grand - redeemApplied));

  const subtotal = round2(netAmt / (1 + taxRate));
  const igv = round2(netAmt - subtotal);
  const pointsEarned = Math.floor(due / 10);

  return { discAmt, netAmt, tipAmt, grand, redeemApplied, due, subtotal, igv, pointsEarned };
}

/** Equal split: amount owed per person (rounded up so the total is covered). */
export function equalSplit(grand: number, people: number): number {
  const n = Math.max(1, Math.floor(people));
  return Math.ceil(grand / n);
}

export interface SplitLine {
  /** per-unit price including modifiers */
  each: number;
  qty: number;
  /** payer index 1..N, or null if unassigned */
  payer: number | null;
}

/**
 * Split by item: each line is assigned to a payer; per-payer raw totals are
 * scaled by grand/amount so tax, discount and tip fold in proportionally.
 * Returns a map of payer index -> amount owed.
 */
export function itemSplit(
  lines: SplitLine[],
  grand: number,
  amount: number,
  payers: number,
): Record<number, number> {
  const ratio = amount > 0 ? grand / amount : 0;
  const totals: Record<number, number> = {};
  for (let p = 1; p <= payers; p++) totals[p] = 0;
  for (const line of lines) {
    if (!line.payer) continue;
    totals[line.payer] = (totals[line.payer] ?? 0) + line.each * line.qty;
  }
  for (const p of Object.keys(totals)) {
    totals[Number(p)] = round2(totals[Number(p)] * ratio);
  }
  return totals;
}
