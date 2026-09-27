import { describe, it, expect } from "vitest";
import { inventoryStatus, parseQty, fmtQty } from "./inventory";

describe("inventario", () => {
  it("clasifica el stock según el ideal", () => {
    expect(inventoryStatus({ stock: 0, par: 10 })).toBe("agotado");
    expect(inventoryStatus({ stock: -1, par: 10 })).toBe("agotado");
    expect(inventoryStatus({ stock: 3, par: 10 })).toBe("bajo");
    expect(inventoryStatus({ stock: 4, par: 10 })).toBe("ok");
  });
  it("lee cantidades con coma o punto", () => {
    expect(parseQty("1,5")).toBe(1.5);
    expect(parseQty(" 2 ")).toBe(2);
    expect(parseQty("")).toBeNaN();
    expect(fmtQty(0.1 + 0.2)).toBe("0.3");
  });
});
