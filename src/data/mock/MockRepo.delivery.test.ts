import { describe, it, expect, beforeEach } from "vitest";
import { MockRepo } from "./MockRepo";
import type { NewDeliveryInput } from "../model";

// Flujo completo de delivery sobre el repo en memoria: crear → aceptar (comanda
// en cocina) → listo → despachar (exige repartidor) → entregado; y cancelación.

describe("MockRepo — delivery punta a punta", () => {
  let repo: MockRepo;
  const input: NewDeliveryInput = {
    channel: "whatsapp",
    customerName: "Carla Mendoza",
    customerPhone: "+51 999 888 777",
    address: "Av. Arequipa 2450",
    reference: "Edificio azul",
    zoneId: "dz-mira", // seed: Miraflores S/ 5, 35 min
    items: [
      { name: "Lomo saltado", qty: 1, price: 42 },
      { name: "Chicha morada 1L", qty: 1, price: 12 },
    ],
    payMethod: "efectivo",
    cashFor: 100,
    notes: "Sin cebolla",
  };

  beforeEach(() => {
    try {
      localStorage?.clear();
    } catch {
      /* node: sin localStorage */
    }
    repo = new MockRepo();
  });

  it("crea el pedido con envío de la zona, código y token no adivinable", async () => {
    const o = await repo.createDeliveryOrder(input);
    expect(o.code).toMatch(/^D-\d+$/);
    expect(o.trackingToken).toMatch(/^[0-9a-f]{24}$/);
    expect(o).toMatchObject({ subtotal: 54, fee: 5, total: 59, status: "recibido", customerPhone: "999888777", etaMin: 35 });
  });

  it("rechaza pedidos inválidos con un mensaje claro", async () => {
    await expect(repo.createDeliveryOrder({ ...input, items: [] })).rejects.toThrow(/producto/);
    await expect(repo.createDeliveryOrder({ ...input, zoneId: "dz-surc" })).rejects.toThrow(/no está activa/);
  });

  it("aceptar envía la comanda al KDS; despachar exige repartidor activo", async () => {
    const o = await repo.createDeliveryOrder(input);
    await repo.setDeliveryStatus(o.id, "preparando");
    const tickets = await repo.getKitchenTickets();
    const ticket = tickets.find((t) => t.tableLabel === `🛵 ${o.code}`);
    expect(ticket?.lines).toEqual([
      { qty: 1, name: "Lomo saltado" },
      { qty: 1, name: "Chicha morada 1L" },
    ]);
    expect(ticket?.note).toBe("Sin cebolla");

    await repo.setDeliveryStatus(o.id, "listo");
    await expect(repo.setDeliveryStatus(o.id, "en_camino")).rejects.toThrow(/repartidor/);
    await expect(repo.setDeliveryStatus(o.id, "en_camino", { driverId: "dr-pedro" })).rejects.toThrow(/no está disponible/); // inactivo
    await repo.setDeliveryStatus(o.id, "en_camino", { driverId: "dr-jose" });
    await repo.setDeliveryStatus(o.id, "entregado");

    const done = (await repo.getDeliveryOrders()).find((x) => x.id === o.id)!;
    expect(done.status).toBe("entregado");
    expect(done.driverName).toBe("José Huamán");
    for (const k of ["acceptedAt", "readyAt", "dispatchedAt", "deliveredAt"] as const) expect(done[k]).toBeTruthy();
  });

  it("la comanda llega al KDS de la sucursal del pedido (regresión: antes quedaba sin sucursal)", async () => {
    const o = await repo.createDeliveryOrder({ ...input, branchId: "b-mira" });
    await repo.setDeliveryStatus(o.id, "preparando");
    const kds = await repo.getKitchenTickets("b-mira");
    expect(kds.some((t) => t.tableLabel === `🛵 ${o.code}`)).toBe(true);
    const other = await repo.getKitchenTickets("b-otra");
    expect(other.some((t) => t.tableLabel === `🛵 ${o.code}`)).toBe(false);
  });

  it("no permite saltarse pasos", async () => {
    const o = await repo.createDeliveryOrder(input);
    await expect(repo.setDeliveryStatus(o.id, "entregado")).rejects.toThrow();
  });

  it("cancelar exige motivo y retira la comanda de cocina", async () => {
    const o = await repo.createDeliveryOrder(input);
    await repo.setDeliveryStatus(o.id, "preparando");
    await expect(repo.setDeliveryStatus(o.id, "cancelado")).rejects.toThrow(/motivo/);
    await repo.setDeliveryStatus(o.id, "cancelado", { cancelReason: "El cliente canceló" });
    const tickets = await repo.getKitchenTickets();
    expect(tickets.some((t) => t.tableLabel === `🛵 ${o.code}`)).toBe(false);
  });

  it("el seguimiento público no expone dirección, teléfono ni montos", async () => {
    const o = await repo.createDeliveryOrder(input);
    await repo.setDeliveryStatus(o.id, "preparando");
    await repo.setDeliveryStatus(o.id, "listo");
    await repo.setDeliveryStatus(o.id, "en_camino", { driverId: "dr-jose" });
    const trk = repo.getDeliveryTracking(o.trackingToken)!;
    expect(trk).toMatchObject({ code: o.code, status: "en_camino", driverName: "José" }); // solo el primer nombre
    // Lista blanca exacta: cualquier campo nuevo en la vista pública debe revisarse a propósito.
    expect(Object.keys(trk).sort()).toEqual(
      ["acceptedAt", "cancelledAt", "code", "createdAt", "deliveredAt", "dispatchedAt", "driverName", "etaMin", "readyAt", "status", "tenantName"].sort(),
    );
    const json = JSON.stringify(trk);
    for (const secret of ["Arequipa", "999888777", "Carla", "Edificio"]) expect(json).not.toContain(secret);
    expect(Object.values(trk)).not.toContain(o.total);
    expect(repo.getDeliveryTracking("nope")).toBeNull();
  });
});
