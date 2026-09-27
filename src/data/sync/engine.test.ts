import { describe, it, expect, beforeEach } from "vitest";
import { MockRepo } from "../mock/MockRepo";
import { MemoryKV } from "./kv";
import { createRepo } from "./PosService";
import type { Repo } from "../Repo";
import type { OpResult, PosOp } from "../pos/ops";

// Modo sin conexión de punta a punta sobre el backend demo: lo que se hace sin
// internet se ve al instante, sobrevive a un reinicio y llega completo (una sola
// vez) al servidor cuando vuelve la conexión.

let online = true;
let listeners: (() => void)[] = [];
const setOnline = (v: boolean) => {
  online = v;
  listeners.forEach((l) => l());
};

function device(backend: MockRepo, kv = new MemoryKV(), key = "t1"): Repo & { service: { engine: { flush(): Promise<void> } } } {
  return createRepo(backend, {
    kv,
    tenantKey: key,
    isOnline: () => online,
    onConnectivity: (cb) => {
      listeners.push(cb);
      return () => (listeners = listeners.filter((l) => l !== cb));
    },
  }) as never;
}

const line = { itemId: "i-cev", name: "Ceviche clásico", qty: 2, unitPrice: 42, extraPrice: 0, modifiers: "" };

beforeEach(() => {
  online = true;
  listeners = [];
  try {
    localStorage?.clear();
  } catch {
    /* node */
  }
});

describe("operación sin conexión", () => {
  it("todo se ve al instante sin red y llega al servidor al reconectar", async () => {
    const server = new MockRepo();
    const pos = device(server);
    const mesa = (await pos.getTables()).find((t) => t.status === "libre")!;
    const stockBefore = (await server.getInventory(mesa.branchId)).find((i) => i.id === "inv-pesc")!.stock;

    setOnline(false);
    const order = await pos.openOrder(mesa.id);
    await pos.addLine(order.id, line);
    await pos.sendToKitchen(order.id);
    expect((await pos.getKitchenTickets()).some((k) => k.orderId === order.id)).toBe(true);
    await pos.payOrder({ orderId: order.id, method: "efectivo", total: 84 });

    // La pantalla ya muestra la mesa libre y el cobro en el historial…
    expect((await pos.getTables()).find((t) => t.id === mesa.id)?.status).toBe("libre");
    expect((await pos.getPaidOrders()).some((o) => o.id === order.id)).toBe(true);
    expect(pos.syncStatus().pending).toBe(4);
    // …pero el servidor todavía no sabe nada.
    expect((await server.getPaidOrders()).some((o) => o.id === order.id)).toBe(false);

    setOnline(true);
    await pos.syncNow();
    expect(pos.syncStatus().pending).toBe(0);
    const paid = (await server.getPaidOrders()).find((o) => o.id === order.id);
    expect(paid).toMatchObject({ status: "cobrada", paidTotal: 84, branchId: mesa.branchId });
    // Efectos de servidor: inventario descontado en la sucursal de la mesa.
    const stockAfter = (await server.getInventory(mesa.branchId)).find((i) => i.id === "inv-pesc")!.stock;
    expect(stockAfter).toBeCloseTo(stockBefore - 0.5, 3);
  });

  it("la cola sobrevive a cerrar la app (se guarda en el dispositivo)", async () => {
    const server = new MockRepo();
    const kv = new MemoryKV();
    const first = device(server, kv);
    const mesa = (await first.getTables()).find((t) => t.status === "libre")!;
    setOnline(false);
    const order = await first.openOrder(mesa.id);
    await first.addLine(order.id, line);

    // "Reinicio": otra instancia sobre el mismo almacenamiento local.
    const reopened = device(server, kv);
    expect((await reopened.getOpenOrderForTable(mesa.id))?.lines).toHaveLength(1);
    setOnline(true);
    await reopened.syncNow();
    expect(reopened.syncStatus().pending).toBe(0);
    const snap = await server.snapshot();
    expect(snap.orders.find((o) => o.id === order.id)?.lines).toHaveLength(1);
  });

  it("si la respuesta se pierde, el reenvío no duplica la venta", async () => {
    const server = new MockRepo();
    let dropNextResponse = true;
    const flaky = Object.create(server) as MockRepo;
    flaky.apply = async (ops: PosOp[]): Promise<OpResult[]> => {
      const res = await server.apply(ops); // el servidor SÍ lo aplica…
      if (dropNextResponse) {
        dropNextResponse = false;
        throw new TypeError("Failed to fetch"); // …pero la respuesta no llega
      }
      return res;
    };
    const pos = device(flaky);
    const mesa = (await pos.getTables()).find((t) => t.status === "libre")!;
    const order = await pos.openOrder(mesa.id);
    await pos.addLine(order.id, line);
    await pos.syncNow();
    const snap = await server.snapshot();
    expect(snap.orders.find((o) => o.id === order.id)?.lines).toHaveLength(1);
  });

  it("dos dispositivos sin red cobran el mismo pedido: el segundo queda como rechazado", async () => {
    const server = new MockRepo();
    const a = device(server, new MemoryKV(), "a");
    const b = device(server, new MemoryKV(), "b");
    const mesa = (await a.getTables()).find((t) => t.status === "libre")!;
    const order = await a.openOrder(mesa.id);
    await a.addLine(order.id, line);
    await b.syncNow(); // b conoce el pedido

    setOnline(false);
    await a.payOrder({ orderId: order.id, method: "efectivo", total: 84 });
    await b.payOrder({ orderId: order.id, method: "yape", total: 84 });

    setOnline(true);
    await a.syncNow();
    await b.syncNow();
    expect(a.syncStatus().rejected).toHaveLength(0);
    expect(b.syncStatus().rejected).toHaveLength(1);
    expect(b.syncStatus().rejected[0].error).toMatch(/ya fue cobrado en otro dispositivo/);
    const paid = (await server.getPaidOrders()).filter((o) => o.id === order.id);
    expect(paid).toHaveLength(1);
    expect(paid[0].paidMethod).toBe("efectivo");
  });

  it("con conexión, un rechazo del servidor se muestra al instante", async () => {
    const server = new MockRepo();
    const a = device(server, new MemoryKV(), "a");
    const b = device(server, new MemoryKV(), "b");
    const mesa = (await a.getTables()).find((t) => t.status === "libre")!;
    const order = await a.openOrder(mesa.id);
    await a.addLine(order.id, line);
    await b.syncNow();
    await a.payOrder({ orderId: order.id, method: "efectivo", total: 84 });
    // b todavía ve la mesa abierta (no ha refrescado) e intenta cobrar.
    await expect(b.payOrder({ orderId: order.id, method: "tarjeta", total: 84 })).rejects.toThrow(/ya fue cobrado/);
    expect(b.syncStatus().rejected).toHaveLength(0);
  });

  it("delivery sin conexión: se registra y al volver la red recibe su código", async () => {
    const server = new MockRepo();
    const pos = device(server);
    await pos.getDeliveryOrders(); // carga el catálogo de zonas
    setOnline(false);
    const d = await pos.createDeliveryOrder({
      channel: "whatsapp",
      customerName: "Carla",
      customerPhone: "999888777",
      address: "Av. Arequipa 2450",
      reference: "",
      zoneId: "dz-mira",
      items: [{ name: "Lomo saltado", qty: 1, price: 48 }],
      payMethod: "yape",
      cashFor: null,
      notes: "",
    });
    expect(d.code).toBe("D-···");
    setOnline(true);
    await pos.syncNow();
    const synced = (await pos.getDeliveryOrders()).find((x) => x.id === d.id);
    expect(synced?.code).toMatch(/^D-\d+$/);
  });

  it("comprobante sin conexión: usa el correlativo de la caja y se envía a SUNAT al volver", async () => {
    const server = new MockRepo();
    const pos = device(server);
    await pos.getTables();
    await new Promise((r) => setTimeout(r, 0)); // registro de la terminal
    setOnline(false);
    const cpe = await pos.emitComprobante({ tipo: "Boleta", subtotal: 100, igv: 18, total: 118, reference: "Mesa 3" });
    expect(cpe.status).toBe("encola");
    expect(cpe.folio).toMatch(/^B001-\d{4}$/);
    setOnline(true);
    await pos.syncNow();
    await server.syncSunat(true);
    const list = await pos.getComprobantes();
    expect(list.find((c) => c.id === cpe.id)).toMatchObject({ folio: cpe.folio, status: "aceptada" });
  });

  it("caja sin conexión: abrir, gasto, cobrar y cerrar; el servidor recalcula el esperado", async () => {
    const server = new MockRepo();
    const pos = device(server);
    const mesa = (await pos.getTables()).find((t) => t.status === "libre")!;
    setOnline(false);
    await pos.openCash(mesa.branchId ?? null, 100);
    const [session] = await pos.getCashSessions(mesa.branchId);
    expect(session).toMatchObject({ status: "abierta", openingFloat: 100 });
    await pos.cashMovement(session.id, "egreso", 20, "Gas");
    const order = await pos.openOrder(mesa.id);
    await pos.addLine(order.id, line);
    await pos.payOrder({ orderId: order.id, method: "efectivo", total: 84 });
    await pos.closeCash(session.id, { efectivo: 164 }, "", { efectivo: 164 });
    setOnline(true);
    await pos.syncNow();
    const [closed] = await server.getCashSessions(mesa.branchId);
    expect(closed).toMatchObject({ status: "cerrada", expected: { efectivo: 164 }, difference: 0 });
  });
});
