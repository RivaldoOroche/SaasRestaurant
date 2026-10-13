import { describe, expect, it } from "vitest";
import { comedorReport } from "./comedorReport";
import type { ComedorConsumo, Comensal } from "@/data/model";

const c = (id: string, plan: Comensal["plan"], balance = 0): Comensal => ({
  id, code: id, name: id.toUpperCase(), tipo: "alumno", grupo: id === "d" ? "Docentes" : "3.° B", plan, abonoHasta: null, balance,
  dailyLimit: null, blockedCategoryIds: [], allergies: "", responsableId: null, active: true,
});
const k = (p: Partial<ComedorConsumo> & Pick<ComedorConsumo, "id" | "kind" | "pago" | "total" | "date">): ComedorConsumo => ({
  comensalId: null, comensalName: "", grupo: "3.° B", items: [], actor: "", branchId: null, at: `${p.date}T17:00:00.000Z`, ...p,
});

describe("comedorReport", () => {
  const comensales = [c("a", "prepago", 30), c("b", "abono", 5), c("d", "convenio")];
  const consumos: ComedorConsumo[] = [
    k({ id: "1", kind: "menu", pago: "saldo", total: 12, date: "2026-10-12", comensalId: "a", items: [{ name: "Menú del día", qty: 1, price: 12 }] }),
    k({ id: "2", kind: "menu", pago: "abono", total: 0, date: "2026-10-12", comensalId: "b" }),
    k({ id: "3", kind: "menu", pago: "convenio", total: 0, date: "2026-10-12", comensalId: "d", grupo: "Docentes" }),
    k({ id: "4", kind: "menu", pago: "convenio", total: 0, date: "2026-10-13", comensalId: "d", grupo: "Docentes" }),
    k({ id: "5", kind: "kiosko", pago: "saldo", total: 6, date: "2026-10-13", comensalId: "a", items: [{ name: "Sándwich", qty: 1, price: 6 }] }),
    k({ id: "6", kind: "kiosko", pago: "efectivo", total: 5, date: "2026-10-13", items: [{ name: "Fruta", qty: 2, price: 2.5 }] }),
    k({ id: "7", kind: "menu", pago: "saldo", total: 12, date: "2026-10-01", comensalId: "a" }), // fuera de rango
  ];
  const r = comedorReport(
    {
      consumos,
      comensales,
      menus: [
        { date: "2026-10-12", entrada: "", fondo: "Ají", postre: "", bebida: "", price: 12, raciones: 4, allergens: "" },
        { date: "2026-10-13", entrada: "", fondo: "Seco", postre: "", bebida: "", price: 13, raciones: 2, allergens: "" },
        { date: "2026-10-14", entrada: "", fondo: "Lentejas", postre: "", bebida: "", price: 12, raciones: 30, allergens: "" },
      ],
      reservas: [
        { comensalId: "a", date: "2026-10-12", by: "familia" },
        { comensalId: "b", date: "2026-10-13", by: "familia" }, // no recogió
        { comensalId: "a", date: "2026-10-14", by: "familia" }, // futuro: no cuenta
      ],
      movimientos: [
        { id: "w1", comensalId: "a", comensalName: "A", kind: "recarga", amount: 50, method: "yape", detail: "", actor: "", balanceAfter: 50, at: "2026-10-12T13:00:00.000Z" },
        { id: "w2", comensalId: "b", comensalName: "B", kind: "abono", amount: 220, method: "transferencia", detail: "", actor: "", balanceAfter: 5, at: "2026-10-12T13:05:00.000Z" },
        { id: "w3", comensalId: "a", comensalName: "A", kind: "consumo", amount: -12, method: "saldo", detail: "", actor: "", balanceAfter: 38, at: "2026-10-12T17:00:00.000Z" },
      ],
    },
    "2026-10-12",
    "2026-10-14",
    "2026-10-13",
  );

  it("cuenta menús y separa lo cobrado de abonos y convenios", () => {
    expect([r.menus, r.ventas, r.ventasMenu, r.ventasKiosko]).toEqual([4, 23, 12, 11]);
    expect(r.porPago.find((p) => p.pago === "convenio")).toEqual({ pago: "convenio", count: 2, total: 0 });
  });
  it("suma recargas y abonos por medio de pago (no los consumos)", () => {
    expect([r.recargado, r.abonos]).toEqual([50, 220]);
    expect(r.recargas.map((x) => x.method)).toEqual(["transferencia", "yape"]);
  });
  it("aprovechamiento de raciones solo con días ya servidos y reservas no recogidas", () => {
    expect([r.raciones, r.sobrantes, r.aprovechamiento]).toEqual([6, 2, 66.7]);
    expect(r.reservasNoRecogidas).toBe(0); // el 13 es hoy: aún puede recoger
  });
  it("liquida convenios al precio del menú de cada día", () => {
    expect(r.convenios).toEqual([{ comensalId: "d", name: "D", grupo: "Docentes", menus: 2, total: 25 }]);
    expect(r.totalConvenios).toBe(25);
  });
  it("top del kiosko, por grupo y saldo en monederos", () => {
    expect(r.topKiosko[0]).toEqual({ name: "Fruta", qty: 2, total: 5 });
    expect(r.porGrupo).toEqual([
      { grupo: "3.° B", menus: 2, kiosko: 6 },
      { grupo: "Docentes", menus: 2, kiosko: 0 },
    ]);
    expect(r.saldoMonederos).toBe(35);
  });
});
