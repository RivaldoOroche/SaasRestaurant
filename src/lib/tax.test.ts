import { describe, it, expect } from "vitest";
import { effectiveRate, splitIncluded, formatRate } from "./tax";
import { computeCheckout } from "./checkout";

describe("impuestos (precios con IGV incluido)", () => {
  it("régimen general usa la tasa configurada", () => {
    expect(effectiveRate("general", 18, new Date("2026-05-01"))).toBe(18);
  });

  it("MYPE restaurante: 10 % en 2025, 10,5 % en 2026, 12 % en 2027 y general después", () => {
    expect(effectiveRate("mype_restaurante", 18, new Date("2025-06-01"))).toBe(10);
    expect(effectiveRate("mype_restaurante", 18, new Date("2026-06-01"))).toBe(10.5);
    expect(effectiveRate("mype_restaurante", 18, new Date("2027-06-01"))).toBe(12);
    expect(effectiveRate("mype_restaurante", 18, new Date("2028-01-02"))).toBe(18);
  });

  it("desglosa el total sin cambiar lo que paga el cliente", () => {
    expect(splitIncluded(118, 18)).toEqual({ base: 100, tax: 18 });
    const { base, tax } = splitIncluded(42, 10.5);
    expect(base + tax).toBeCloseTo(42, 2);
    expect(base).toBe(38.01);
  });

  it("el cobro de una carta de S/ 118 es S/ 118 (no S/ 139.24)", () => {
    const r = computeCheckout({ amount: 118, taxRate: 0.18 });
    expect(r.due).toBe(118);
    expect(r.subtotal).toBe(100);
    expect(r.igv).toBe(18);
  });

  it("formatea la tasa al estilo peruano", () => {
    expect(formatRate(10.5)).toBe("10,5 %");
  });
});
