import { describe, it, expect } from "vitest";
import { computeCheckout, equalSplit, itemSplit } from "./checkout";

describe("computeCheckout", () => {
  it("plain amount: derives subtotal/IGV from the gross", () => {
    const r = computeCheckout({ amount: 118, taxRate: 0.18 });
    expect(r.grand).toBe(118);
    expect(r.subtotal).toBe(100);
    expect(r.igv).toBe(18);
    expect(r.pointsEarned).toBe(11); // floor(118/10)
  });

  it("applies discount before tip (tip on net)", () => {
    const r = computeCheckout({ amount: 100, taxRate: 0.18, discountPct: 0.15, tipPct: 0.1 });
    expect(r.discAmt).toBe(15);
    expect(r.netAmt).toBe(85);
    expect(r.tipAmt).toBe(8.5); // 10% of 85, not of 100
    expect(r.grand).toBe(93.5);
  });

  it("cortesía (100% discount) zeroes the bill", () => {
    const r = computeCheckout({ amount: 200, taxRate: 0.18, discountPct: 1 });
    expect(r.netAmt).toBe(0);
    expect(r.grand).toBe(0);
    expect(r.due).toBe(0);
  });

  it("caps loyalty redemption so due never goes negative", () => {
    const r = computeCheckout({ amount: 50, taxRate: 0.18, redeem: 999 });
    expect(r.redeemApplied).toBe(50);
    expect(r.due).toBe(0);
    expect(r.pointsEarned).toBe(0);
  });

  it("earns points on the post-redemption amount", () => {
    const r = computeCheckout({ amount: 100, taxRate: 0.18, redeem: 40 });
    expect(r.due).toBe(60);
    expect(r.pointsEarned).toBe(6);
  });
});

describe("equalSplit", () => {
  it("rounds up per-person so the total is covered", () => {
    expect(equalSplit(100, 3)).toBe(34);
    expect(equalSplit(620, 2)).toBe(310);
  });
  it("guards against zero people", () => {
    expect(equalSplit(100, 0)).toBe(100);
  });
});

describe("itemSplit", () => {
  it("scales per-payer raw totals by grand/amount", () => {
    const lines = [
      { each: 40, qty: 1, payer: 1 },
      { each: 60, qty: 1, payer: 2 },
    ];
    // amount 100 -> grand 110 (e.g. +10% tip); ratio 1.1
    const totals = itemSplit(lines, 110, 100, 2);
    expect(totals[1]).toBe(44);
    expect(totals[2]).toBe(66);
  });
  it("ignores unassigned lines", () => {
    const lines = [{ each: 40, qty: 1, payer: null }];
    const totals = itemSplit(lines, 40, 40, 2);
    expect(totals[1]).toBe(0);
    expect(totals[2]).toBe(0);
  });
});
