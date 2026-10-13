import { describe, it, expect, beforeEach } from "vitest";
import { MockRepo } from "./MockRepo";
import { composeRepo } from "../index";
import { MemoryKV } from "../sync/kv";
import type { Repo } from "../Repo";
import { localDate } from "@/lib/comedor";

// Comedor escolar del demo (Colegio San Martín): padrón, monedero, despacho con
// las reglas del colegio y portal de familias, sobre el repo completo de la app.

describe("MockRepo — comedor", () => {
  let repo: Repo;
  let backend: MockRepo;
  const today = localDate();

  beforeEach(() => {
    try {
      localStorage?.clear();
    } catch {
      /* node: sin localStorage */
    }
    backend = new MockRepo("comedor");
    repo = composeRepo(backend, `test-${Math.random()}`, new MemoryKV());
  });

  const lucia = async () => (await repo.getComensales()).find((c) => c.code === "A-0101")!;

  it("el demo trae el colegio: tipo comedor, padrón, familias y menús", async () => {
    const s = await repo.getSettings();
    expect([s.businessType, s.bloquearOctogonos]).toEqual(["comedor", true]);
    expect((await repo.getComensales()).length).toBe(20);
    expect((await repo.getResponsables()).every((r) => r.portalToken.length === 36)).toBe(true);
    expect((await repo.getComensalQuota())).toMatchObject({ plan: "Comedor Pro", used: 20, max: 1000 });
  });

  it("recarga en efectivo: exige caja abierta y suma al saldo", async () => {
    const c = await lucia();
    const input = { comensalId: c.id, amount: 50, method: "efectivo" as const, actor: "Rosa", branchId: "cb-1" };
    await expect(repo.recargarSaldo(input)).rejects.toThrow(/Abre la caja/);
    await repo.openCash("cb-1", 100);
    const m = await repo.recargarSaldo(input);
    expect(m.balanceAfter).toBe(c.balance + 50);
    const caja = (await repo.getCashSessions("cb-1")).find((x) => x.status === "abierta")!;
    expect(caja.movements.map((x) => [x.kind, x.amount])).toEqual([["ingreso", 50]]);
  });

  it("kiosko: bloquea octógonos, respeta el tope diario y descuenta el saldo", async () => {
    const c = await lucia(); // tope S/ 10
    await expect(repo.despachar({ comensalId: c.id, kind: "kiosko", items: [{ menuItemId: "k-galle", name: "x", qty: 1, price: 0 }], actor: "Beto", branchId: "cb-1" }))
      .rejects.toThrow(/octógonos/);
    const r = await repo.despachar({ comensalId: c.id, kind: "kiosko", items: [{ menuItemId: "k-sand", name: "x", qty: 1, price: 0.1 }], actor: "Beto", branchId: "cb-1" });
    expect([r.total, r.pago, r.balance]).toEqual([6, "saldo", c.balance - 6]);
    await expect(repo.despachar({ comensalId: c.id, kind: "kiosko", items: [{ menuItemId: "k-sand", name: "x", qty: 1, price: 6 }], actor: "Beto", branchId: "cb-1" }))
      .rejects.toThrow(/tope diario de S\/ 10.00: le quedan S\/ 4.00/);
  });

  it("menú: una ración por día y la familia lo ve en su portal", async () => {
    const menu = (await repo.getComedorMenus(today, today))[0];
    if (!menu) return; // fin de semana: el demo no publica menú hoy
    await repo.openCash("cb-1", 0);
    await repo.recargarSaldo({ comensalId: (await lucia()).id, amount: 20, method: "yape", actor: "Rosa", branchId: "cb-1" });
    const c = await lucia();
    await repo.setReserva(c.id, today, true);
    const r = await repo.despachar({ comensalId: c.id, kind: "menu", items: [], actor: "Beto", branchId: "cb-1" });
    expect(r.pago).toBe("saldo");
    await expect(repo.despachar({ comensalId: c.id, kind: "menu", items: [], actor: "Beto", branchId: "cb-1" })).rejects.toThrow(/ya recibió/);
    const token = (await repo.getResponsables()).find((x) => x.id === c.responsableId)!.portalToken;
    const portal = backend.getPortalFamilia(token)!;
    expect(portal.comensales.map((x) => x.name)).toEqual(["Lucía Ramos Torres", "Mateo Ramos Torres"]);
    expect(portal.comensales[0].consumos[0].detail).toBe("1× Menú del día");
  });

  it("portal: la familia fija tope y bloquea categorías solo de sus hijos", async () => {
    const c = await lucia();
    const token = (await repo.getResponsables()).find((x) => x.id === c.responsableId)!.portalToken;
    await backend.portalAjustes(token, c.id, { dailyLimit: 5, blockedCategoryIds: ["k-pos", "otra"], allergies: "Maní y nueces" });
    expect(await lucia()).toMatchObject({ dailyLimit: 5, blockedCategoryIds: ["k-pos"], allergies: "Maní y nueces" });
    const ajeno = (await repo.getComensales()).find((x) => x.code === "A-0103")!;
    await expect(backend.portalAjustes(token, ajeno.id, { dailyLimit: 1, blockedCategoryIds: [], allergies: "" })).rejects.toThrow(/Enlace no válido/);
    expect(backend.getPortalFamilia("corto")).toBeNull();
  });

  it("importa un padrón pegado de Excel: crea, actualiza por código y enlaza a la familia", async () => {
    const { parsePadron } = await import("@/lib/comedor");
    const { rows } = parsePadron("A-0101\tLucía Ramos T.\t4.° B primaria\nA-0999\tNuevo Alumno\t1.° A\talumno\tprepago\t\tPapá Nuevo\t999111222");
    expect(await repo.importPadron(rows)).toEqual({ created: 1, updated: 1 });
    const all = await repo.getComensales();
    expect(all.find((x) => x.code === "A-0101")).toMatchObject({ name: "Lucía Ramos T.", grupo: "4.° B primaria" });
    const nuevo = all.find((x) => x.code === "A-0999")!;
    expect((await repo.getResponsables()).find((r) => r.id === nuevo.responsableId)?.phone).toBe("999111222");
  });
});
