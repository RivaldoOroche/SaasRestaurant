import { describe, it, expect } from "vitest";
import {
  nextStatus,
  canTransition,
  needsDriver,
  deliveryTotals,
  changeDue,
  normalizePhonePe,
  validateNewDelivery,
  isLate,
  whatsappLink,
  transitionPatch,
} from "./delivery";
import type { DeliveryZone, NewDeliveryInput } from "@/data/model";

const zones: DeliveryZone[] = [
  { id: "z1", name: "Miraflores", fee: 5, etaMin: 35, active: true },
  { id: "z2", name: "Surco", fee: 8, etaMin: 50, active: false },
];

const base: NewDeliveryInput = {
  channel: "telefono",
  customerName: "Rosa Quispe",
  customerPhone: "987 654 321",
  address: "Av. Larco 123",
  reference: "",
  zoneId: "z1",
  items: [{ name: "Lomo saltado", qty: 2, price: 42 }],
  payMethod: "efectivo",
  cashFor: null,
  notes: "",
};

describe("delivery — máquina de estados", () => {
  it("avanza un paso a la vez", () => {
    expect(nextStatus("recibido")).toBe("preparando");
    expect(nextStatus("en_camino")).toBe("entregado");
    expect(nextStatus("entregado")).toBeNull();
    expect(canTransition("recibido", "preparando")).toBe(true);
    expect(canTransition("recibido", "en_camino")).toBe(false); // no se salta pasos
    expect(canTransition("listo", "preparando")).toBe(false); // no retrocede
  });
  it("se puede cancelar mientras no haya terminado", () => {
    expect(canTransition("en_camino", "cancelado")).toBe(true);
    expect(canTransition("entregado", "cancelado")).toBe(false);
    expect(canTransition("cancelado", "preparando")).toBe(false);
  });
  it("despachar exige repartidor solo en pedidos propios", () => {
    expect(needsDriver("telefono", "en_camino")).toBe(true);
    expect(needsDriver("rappi", "en_camino")).toBe(false);
    expect(needsDriver("telefono", "listo")).toBe(false);
  });
});

describe("delivery — montos", () => {
  it("suma subtotal + envío con redondeo a céntimos", () => {
    expect(deliveryTotals([{ name: "a", qty: 3, price: 0.1 }], 5)).toEqual({ subtotal: 0.3, fee: 5, total: 5.3 });
  });
  it("calcula el vuelto solo en efectivo", () => {
    expect(changeDue(89, "efectivo", 100)).toBe(11);
    expect(changeDue(89, "yape", 100)).toBe(0);
    expect(changeDue(89, "efectivo", null)).toBe(0);
  });
});

describe("delivery — validación", () => {
  it("normaliza celulares peruanos", () => {
    expect(normalizePhonePe("+51 987 654 321")).toBe("987654321");
    expect(normalizePhonePe("987654321")).toBe("987654321");
    expect(normalizePhonePe("0145678")).toBeNull();
  });
  it("acepta un pedido propio válido", () => {
    expect(validateNewDelivery(base, zones)).toBeNull();
  });
  it("rechaza zona inactiva, teléfono inválido y dirección vacía", () => {
    expect(validateNewDelivery({ ...base, zoneId: "z2" }, zones)).toMatch(/zona/i);
    expect(validateNewDelivery({ ...base, customerPhone: "123" }, zones)).toMatch(/celular/i);
    expect(validateNewDelivery({ ...base, address: " " }, zones)).toMatch(/dirección/i);
  });
  it("rechaza 'paga con' menor al total (84 + 5 de envío = 89)", () => {
    expect(validateNewDelivery({ ...base, cashFor: 50 }, zones)).toMatch(/menor al total/);
    expect(validateNewDelivery({ ...base, cashFor: 100 }, zones)).toBeNull();
  });
  it("pedidos de apps: sin dirección ni zona, pero cobrados en la app", () => {
    const rappi = { ...base, channel: "rappi" as const, address: "", zoneId: null, customerPhone: "" };
    expect(validateNewDelivery({ ...rappi, payMethod: "pagado_app" }, zones)).toBeNull();
    expect(validateNewDelivery({ ...rappi, payMethod: "efectivo" }, zones)).toMatch(/app/);
  });
});

describe("delivery — transiciones", () => {
  const now = "2026-09-25T20:00:00.000Z";
  it("sella la hora de cada paso", () => {
    expect(transitionPatch({ status: "recibido", channel: "web", driverId: null }, "preparando", {}, now)).toEqual({
      status: "preparando",
      acceptedAt: now,
    });
  });
  it("no despacha un pedido propio sin repartidor", () => {
    expect(() => transitionPatch({ status: "listo", channel: "telefono", driverId: null }, "en_camino", {}, now)).toThrow(/repartidor/);
    expect(transitionPatch({ status: "listo", channel: "telefono", driverId: null }, "en_camino", { driverId: "d1" }, now)).toMatchObject({
      driverId: "d1",
      dispatchedAt: now,
    });
  });
  it("un pedido de Rappi se despacha sin repartidor propio", () => {
    expect(transitionPatch({ status: "listo", channel: "rappi", driverId: null }, "en_camino", {}, now)).toMatchObject({
      status: "en_camino",
      driverId: null,
    });
  });
  it("cancelar exige motivo; no se reabre un pedido terminado", () => {
    expect(() => transitionPatch({ status: "preparando", channel: "web", driverId: null }, "cancelado", { cancelReason: "  " }, now)).toThrow(/motivo/);
    expect(() => transitionPatch({ status: "entregado", channel: "web", driverId: null }, "cancelado", { cancelReason: "x" }, now)).toThrow();
  });
});

describe("delivery — tiempos y enlaces", () => {
  it("marca atrasado solo si sigue activo y pasó el ETA", () => {
    const now = Date.parse("2026-09-25T20:00:00Z");
    const created = "2026-09-25T19:20:00Z"; // hace 40 min
    expect(isLate({ status: "en_camino", createdAt: created, etaMin: 35 }, now)).toBe(true);
    expect(isLate({ status: "entregado", createdAt: created, etaMin: 35 }, now)).toBe(false);
    expect(isLate({ status: "preparando", createdAt: created, etaMin: 45 }, now)).toBe(false);
  });
  it("arma el enlace de WhatsApp con +51", () => {
    expect(whatsappLink("987654321", "Hola")).toBe("https://wa.me/51987654321?text=Hola");
    expect(whatsappLink("abc", "x")).toBeNull();
  });
});
