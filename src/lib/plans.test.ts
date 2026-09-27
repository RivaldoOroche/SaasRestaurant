import { describe, it, expect } from "vitest";
import { PLANS, annualMonthly, branchLimitLabel, extraBranches, monthlyTotal, planInfo, quotaExceededMessage } from "./plans";

describe("planes (la mayoría de restaurantes tiene un local)", () => {
  it("precios vigentes (IGV incluido) y anual = 10 meses", () => {
    expect(PLANS.map((p) => [p.tier, p.price, p.annualPrice])).toEqual([
      ["Básico", 159, 1590],
      ["Pro", 299, 2990],
      ["Enterprise", 899, 8990],
    ]);
    expect(annualMonthly(planInfo("Básico"))).toBe(132.5);
  });

  it("Básico: un solo local", () => {
    const b = planInfo("Básico");
    expect(branchLimitLabel(b)).toBe("1 local");
    expect(monthlyTotal(b, 0)).toBe(159);
    expect(quotaExceededMessage("Básico", 0)).toMatch(/un solo local/);
  });

  it("Pro: 2 locales incluidos + S/ 119 por local adicional, hasta 5", () => {
    const p = planInfo("Pro");
    expect(branchLimitLabel(p)).toBe("2 locales incluidos + S/ 119 por local adicional (hasta 5)");
    expect(monthlyTotal(p, 1)).toBe(299);
    expect(monthlyTotal(p, 2)).toBe(418);
    expect(monthlyTotal(p, 4)).toBe(656);
    expect(quotaExceededMessage("Pro", 4)).toMatch(/hasta 5 locales/);
  });

  it("Enterprise: 6 locales incluidos + S/ 99 por local adicional, sin tope", () => {
    const e = planInfo("Enterprise");
    expect(extraBranches(e, 5)).toBe(0);
    expect(monthlyTotal(e, 7)).toBe(1097);
    expect(branchLimitLabel(e)).toBe("6 locales incluidos + S/ 99 por local adicional");
  });
});
