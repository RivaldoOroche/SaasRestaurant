import { describe, it, expect, beforeEach } from "vitest";
import { MockRepo } from "./MockRepo";
import type { DraftLine } from "../model";

// Prueba de integración del flujo central del POS sobre el repo en memoria:
// abrir pedido → agregar línea → enviar a cocina → cobrar. Verifica los
// invariantes que la UI da por sentados (mesa liberada, comanda retirada, etc.).

describe("MockRepo — ciclo de vida del pedido", () => {
  let repo: MockRepo;
  beforeEach(() => {
    try {
      localStorage?.clear();
    } catch {
      /* sin localStorage en node: MockRepo usa el estado por defecto */
    }
    repo = new MockRepo();
  });

  it("abre un pedido en una mesa libre", async () => {
    const tables = await repo.getTables();
    const free = tables.find((t) => t.status === "libre");
    expect(free).toBeTruthy();
    const order = await repo.openOrder(free!.id);
    expect(order.tableId).toBe(free!.id);
    expect(order.status).toBe("abierta");
    expect(order.lines).toEqual([]);
  });

  it("agrega líneas y calcula el total del pedido", async () => {
    const tables = await repo.getTables();
    const free = tables.find((t) => t.status === "libre")!;
    const order = await repo.openOrder(free.id);
    const line: DraftLine = { itemId: "x", name: "Lomo Saltado", qty: 2, unitPrice: 42, extraPrice: 0, modifiers: "" };
    await repo.addLine(order.id, line);
    const updated = await repo.getOpenOrderForTable(free.id);
    expect(updated?.lines.length).toBe(1);
    const subtotal = updated!.lines.reduce((s, l) => s + (l.unitPrice + l.extraPrice) * l.qty, 0);
    expect(subtotal).toBe(84);
  });

  it("envía a cocina y aparece una comanda", async () => {
    const tables = await repo.getTables();
    const free = tables.find((t) => t.status === "libre")!;
    const order = await repo.openOrder(free.id);
    await repo.addLine(order.id, { itemId: "x", name: "Ceviche", qty: 1, unitPrice: 38, extraPrice: 0, modifiers: "" });
    const before = (await repo.getKitchenTickets()).length;
    await repo.sendToKitchen(order.id);
    const after = await repo.getKitchenTickets();
    expect(after.length).toBe(before + 1);
    expect(after.some((t) => t.orderId === order.id)).toBe(true);
  });

  it("cobra el pedido: libera la mesa y retira la comanda", async () => {
    const tables = await repo.getTables();
    const free = tables.find((t) => t.status === "libre")!;
    const order = await repo.openOrder(free.id);
    await repo.addLine(order.id, { itemId: "x", name: "Aji de gallina", qty: 1, unitPrice: 32, extraPrice: 0, modifiers: "" });
    await repo.sendToKitchen(order.id);
    await repo.payOrder({ orderId: order.id, method: "efectivo", total: 32 });

    const stillOpen = await repo.getOpenOrderForTable(free.id);
    expect(stillOpen).toBeFalsy();
    const tablesAfter = await repo.getTables();
    expect(tablesAfter.find((t) => t.id === free.id)?.status).toBe("libre");
    const tickets = await repo.getKitchenTickets();
    expect(tickets.some((t) => t.orderId === order.id)).toBe(false);
  });
});
