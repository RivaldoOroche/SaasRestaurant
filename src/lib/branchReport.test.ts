import { describe, it, expect } from "vitest";
import { rollup, grandTotal, grossMargin, foodCostPct, emptyFigures } from "./branchReport";
import type { Branch, BranchReportRow } from "@/data/model";

const branches: Branch[] = [
  { id: "p", name: "Principal", city: "Lima", parentId: null },
  { id: "n", name: "Zona Norte", city: "Lima", parentId: "p" },
  { id: "n1", name: "Los Olivos", city: "Lima", parentId: "n" },
  { id: "n2", name: "Comas", city: "Lima", parentId: "n" },
  { id: "s", name: "Surco", city: "Lima", parentId: "p" },
];
const row = (id: string, sales: number, orders: number, foodCost = 0): BranchReportRow => ({ ...emptyFigures(), branchId: id, sales, orders, foodCost });

describe("consolidado del árbol", () => {
  const tree = rollup(branches, [row("p", 1000, 10, 300), row("n1", 200, 4, 50), row("n2", 100, 2, 40), row("s", 50, 1)]);

  it("cada rama suma sus sucursales; la raíz es el total", () => {
    const norte = tree[0].children.find((c) => c.branch.id === "n")!;
    expect(norte.own.sales).toBe(0);
    expect(norte.branchTotal.sales).toBe(300);
    expect(norte.branchTotal.orders).toBe(6);
    expect(tree[0].branchTotal.sales).toBe(1350);
    expect(grandTotal(tree).orders).toBe(17);
  });

  it("sucursal sin movimientos aparece en cero", () => {
    const t = rollup(branches, []);
    expect(grandTotal(t).sales).toBe(0);
    expect(t[0].children).toHaveLength(2);
  });

  it("margen bruto y food cost %", () => {
    const f = tree[0].branchTotal;
    expect(grossMargin(f)).toBe(1350 - 390);
    expect(foodCostPct(f)).toBe(28.9);
    expect(foodCostPct(emptyFigures())).toBeNull();
  });
});
