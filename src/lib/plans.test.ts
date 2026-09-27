import { describe, it, expect } from "vitest";
import { PLANS, annualMonthly, branchLimitLabel, extraBranches, monthlyTotal, planInfo } from "./plans";

describe("planes", () => {
  it("precios vigentes (IGV incluido) y anual = 10 meses", () => {
    expect(PLANS.map((p) => [p.tier, p.price, p.annualPrice])).toEqual([
      ["Básico", 149, 1490],
      ["Pro", 349, 3490],
      ["Enterprise", 899, 8990],
    ]);
    expect(annualMonthly(planInfo("Básico"))).toBe(124.17);
  });

  it("Enterprise: 25 locales incluidos y S/ 29 por local adicional", () => {
    const e = planInfo("Enterprise");
    expect(extraBranches(e, 24)).toBe(0);
    expect(monthlyTotal(e, 24)).toBe(899);
    expect(monthlyTotal(e, 26)).toBe(957);
    expect(branchLimitLabel(e)).toBe("25 locales incluidos + S/ 29 por local adicional");
  });

  it("Básico y Pro no tienen adicionales", () => {
    expect(monthlyTotal(planInfo("Básico"), 2)).toBe(149);
    expect(branchLimitLabel(planInfo("Básico"))).toBe("principal + 2 sucursales");
    expect(branchLimitLabel(null)).toBe("sucursales ilimitadas");
  });
});
