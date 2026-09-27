import { describe, it, expect, beforeEach } from "vitest";
import { MockRepo } from "./MockRepo";

// Constructor de carta sobre el backend demo: categoría → plato → receta →
// precio propio de una sucursal → archivar.
describe("MockRepo — carta", () => {
  let repo: MockRepo;
  beforeEach(() => {
    try {
      localStorage?.clear();
    } catch {
      /* node */
    }
    repo = new MockRepo();
  });

  it("crea categoría y plato, y aplica el precio de una sucursal", async () => {
    await repo.saveCategory({ name: "Postres de prueba", icon: "🍮", subtitle: "" });
    const cat = (await repo.getMenuCatalog()).categories.find((c) => c.name === "Postres de prueba")!;
    expect(cat).toBeTruthy();
    const id = await repo.saveMenuItem({
      categoryId: cat.id, name: "Suspiro limeño", description: "", price: 14, emoji: "🍮",
      badge: null, veg: true, spicy: false, gf: false, meat: false, available: true,
    });
    const [branch] = await repo.getBranches();
    await repo.setBranchOverride(id, branch.id, { price: 16, available: null });
    expect((await repo.getMenuItems()).find((i) => i.id === id)?.price).toBe(14);
    expect((await repo.getMenuItems(branch.id)).find((i) => i.id === id)?.price).toBe(16);

    // Volver a los generales
    await repo.setBranchOverride(id, branch.id, { price: null, available: null });
    expect((await repo.getMenuItems(branch.id)).find((i) => i.id === id)?.price).toBe(14);

    // No se puede borrar una categoría con platos; archivar lo saca de la venta
    await expect(repo.removeCategory(cat.id)).rejects.toThrow();
    await repo.archiveMenuItem(id, true);
    expect((await repo.getMenuItems()).some((i) => i.id === id)).toBe(false);
    expect((await repo.getMenuCatalog()).items.find((i) => i.id === id)?.archived).toBe(true);
  });

  it("crea un insumo y lo usa en la receta", async () => {
    const insumo = await repo.saveInventoryItem({ name: "Leche condensada", unit: "lata", cost: 6.5, par: 10 });
    const item = (await repo.getMenuItems())[0];
    await repo.setRecipe(item.id, [{ inventoryId: insumo, qtyPerUnit: 0.5 }]);
    expect((await repo.getRecipes())[item.id]).toEqual([{ inventoryId: insumo, qtyPerUnit: 0.5 }]);
    expect((await repo.getInventory()).find((i) => i.id === insumo)?.cost).toBe(6.5);
  });
});

describe("MockRepo — inventario entre sucursales", () => {
  it("compra, merma y traslado quedan en el kardex con el stock correcto", async () => {
    const repo = new MockRepo();
    const [a, b] = await repo.getBranches();
    const item = (await repo.getInventory())[0];
    const stockAt = async (br: string) => (await repo.getInventory(br)).find((i) => i.id === item.id)!.stock;
    const [a0, b0] = [await stockAt(a.id), await stockAt(b.id)];
    const { makeOp, uuid } = await import("../pos/ops");
    await repo.apply([
      makeOp({ type: "inventory.adjust", item_id: item.id, branch_id: a.id, delta: 10, reason: "compra", note: "Factura 123" }, "Mónica"),
      makeOp({ type: "inventory.adjust", item_id: item.id, branch_id: a.id, delta: -1, reason: "merma" }, "Mónica"),
      makeOp({ type: "inventory.transfer", transfer_id: uuid(), item_id: item.id, from_branch_id: a.id, to_branch_id: b.id, qty: 4, note: "" }, "Mónica"),
    ]);
    expect(await stockAt(a.id)).toBeCloseTo(a0 + 10 - 1 - 4, 3);
    expect(await stockAt(b.id)).toBeCloseTo(b0 + 4, 3);
    const k = await repo.getInventoryMovements(a.id);
    expect(k.slice(0, 3).map((m) => [m.reason, m.delta])).toEqual([
      ["traslado", -4],
      ["merma", -1],
      ["compra", 10],
    ]);
    expect(k[2].note).toBe("Factura 123");
  });
});
