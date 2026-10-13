import { describe, it, expect } from "vitest";
import { PLANS, annualMonthly, branchLimitLabel, comensalLimitLabel, extraBranches, extraComensalBlocks, monthlyTotal, planInfo, plansFor, quotaExceededMessage } from "./plans";

describe("planes (la mayoría de restaurantes tiene un local)", () => {
  it("precios vigentes (IGV incluido) y anual = 10 meses", () => {
    expect(PLANS.map((p) => [p.tier, p.price, p.annualPrice])).toEqual([
      ["Básico", 159, 1590],
      ["Pro", 299, 2990],
      ["Enterprise", 899, 8990],
      ["Comedor", 249, 2490],
      ["Comedor Pro", 449, 4490],
      ["Comedor Institucional", 899, 8990],
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

describe("planes de comedor", () => {
  it("cada tipo de negocio ve solo sus planes", () => {
    expect(plansFor("comedor").map((p) => p.tier)).toEqual(["Comedor", "Comedor Pro", "Comedor Institucional"]);
    expect(plansFor(undefined).map((p) => p.tier)).toEqual(["Básico", "Pro", "Enterprise"]);
  });
  it("el Institucional cobra por bloques de 100 comensales sobre 2 000 (igual que la base)", () => {
    const inst = planInfo("Comedor Institucional");
    expect(extraComensalBlocks(inst, 2000)).toBe(0);
    expect(extraComensalBlocks(inst, 2001)).toBe(1);
    expect(monthlyTotal(inst, 4, 2150)).toBe(969);
    expect(monthlyTotal(planInfo("Comedor"), 0, 300)).toBe(249);
  });
  it("describe los comensales del plan", () => {
    expect(comensalLimitLabel(planInfo("Comedor"))).toBe("hasta 300 comensales activos");
    expect(comensalLimitLabel(planInfo("Comedor Institucional"))).toMatch(/2.000 comensales incluidos \+ S\/ 35 por cada 100/);
  });
});
