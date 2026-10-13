import { describe, expect, it } from "vitest";
import { kioskoBlock, menuCheck, parsePadron, puedeReservar, nextSchoolDays, abonoVigente, type ComensalLike } from "./comedor";

const base: ComensalLike = {
  name: "Lucía",
  plan: "prepago",
  balance: 20,
  dailyLimit: 10,
  blockedCategoryIds: [],
  abonoHasta: null,
  active: true,
};
const fruta = { name: "Fruta", qty: 1, price: 3, categoryId: "c-sal", octogonos: 0 };
const galleta = { name: "Galleta", qty: 1, price: 2, categoryId: "c-snk", octogonos: 2 };

describe("kioskoBlock", () => {
  it("permite una compra dentro del tope y del saldo", () => {
    expect(kioskoBlock(base, [fruta], 0, { bloquearOctogonos: true })).toBeNull();
  });
  it("bloquea productos con octógonos en colegios", () => {
    expect(kioskoBlock(base, [galleta], 0, { bloquearOctogonos: true })).toMatch(/octógonos/);
    expect(kioskoBlock(base, [galleta], 0, { bloquearOctogonos: false })).toBeNull();
  });
  it("respeta el tope diario contando lo ya gastado", () => {
    expect(kioskoBlock(base, [{ ...fruta, qty: 2 }], 5, { bloquearOctogonos: false })).toMatch(/tope diario.*S\/ 5\.00/);
  });
  it("respeta las categorías bloqueadas por la familia", () => {
    const c = { ...base, blockedCategoryIds: ["c-sal"] };
    expect(kioskoBlock(c, [fruta], 0, { bloquearOctogonos: false }, () => "Snacks")).toMatch(/bloqueó «Snacks»/);
  });
  it("no deja el saldo en negativo", () => {
    const c = { ...base, balance: 2, dailyLimit: null };
    expect(kioskoBlock(c, [fruta], 0, { bloquearOctogonos: false })).toMatch(/Saldo insuficiente/);
  });
});

describe("menuCheck", () => {
  const menu = { date: "2026-10-14", price: 12, raciones: 3 };
  const st = { yaServido: false, reservado: true, servidos: 0, reservasPendientes: 1 };
  it("cobra el menú del saldo si es prepago", () => {
    expect(menuCheck({ ...base, balance: 20 }, menu, st, { permitirSinReserva: false })).toEqual({ ok: true, pago: "saldo", cargo: 12 });
  });
  it("no cobra con abono vigente y sí cuando venció", () => {
    const c = { ...base, plan: "abono" as const, abonoHasta: "2026-10-31", balance: 0 };
    expect(menuCheck(c, menu, st, { permitirSinReserva: false })).toMatchObject({ ok: true, pago: "abono", cargo: 0 });
    expect(menuCheck({ ...c, abonoHasta: "2026-10-01" }, menu, st, { permitirSinReserva: false }).motivo).toMatch(/abono venció/);
  });
  it("convenio no descuenta saldo", () => {
    expect(menuCheck({ ...base, plan: "convenio", balance: 0 }, menu, st, { permitirSinReserva: false })).toMatchObject({ ok: true, pago: "convenio" });
  });
  it("una sola ración por día", () => {
    expect(menuCheck(base, menu, { ...st, yaServido: true }, { permitirSinReserva: true }).motivo).toMatch(/ya recibió/);
  });
  it("sin reserva: solo con raciones libres y si el comedor lo permite", () => {
    const sin = { ...st, reservado: false, servidos: 1, reservasPendientes: 2 };
    expect(menuCheck(base, menu, sin, { permitirSinReserva: false }).motivo).toMatch(/no reservó/);
    expect(menuCheck(base, menu, sin, { permitirSinReserva: true }).motivo).toMatch(/raciones libres/);
    expect(menuCheck(base, menu, { ...sin, reservasPendientes: 1 }, { permitirSinReserva: true }).ok).toBe(true);
  });
});

describe("reservas y fechas", () => {
  it("cierra las reservas del día a la hora límite", () => {
    const at = (h: number) => new Date(2026, 9, 14, h, 0);
    expect(puedeReservar("2026-10-14", at(8), "09:30")).toBe(true);
    expect(puedeReservar("2026-10-14", at(10), "09:30")).toBe(false);
    expect(puedeReservar("2026-10-15", at(23), "09:30")).toBe(true);
    expect(puedeReservar("2026-10-13", at(1), "09:30")).toBe(false);
  });
  it("salta fines de semana", () => {
    expect(nextSchoolDays(new Date(2026, 9, 16), 3)).toEqual(["2026-10-16", "2026-10-19", "2026-10-20"]);
  });
  it("abono vigente por fecha", () => {
    expect(abonoVigente({ plan: "abono", abonoHasta: "2026-10-31" }, "2026-10-31")).toBe(true);
    expect(abonoVigente({ plan: "prepago", abonoHasta: "2026-10-31" }, "2026-10-01")).toBe(false);
  });
});

describe("parsePadron", () => {
  it("lee Excel pegado con encabezado y normaliza tipo, plan y celular", () => {
    const txt = "Código\tNombre\tGrado\tTipo\tPlan\tAlergias\tResponsable\tCelular\tCorreo\n" +
      "A001\tLucía Ramos\t3.° B\tAlumno\tAbono\tmaní\tRosa Ramos\t987 654 321\trosa@x.pe\n" +
      "D010;Prof. Díaz;Docentes;docente;convenio\n" +
      "\tSin código\n" +
      "A001,Otra,4.° A";
    const { rows, errors } = parsePadron(txt);
    expect(rows[0]).toMatchObject({ code: "A001", plan: "abono", tipo: "alumno", guardianPhone: "987654321", allergies: "maní" });
    expect(rows[1]).toMatchObject({ code: "D010", tipo: "docente", plan: "convenio" });
    expect(errors).toEqual(["Fila 4: falta el código o el nombre.", "El código A001 se repite en el padrón."]);
  });
});
