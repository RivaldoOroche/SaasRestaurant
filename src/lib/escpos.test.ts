import { describe, it, expect } from "vitest";
import { comandaBytes, EscPos, ticketBytes, toAscii } from "./escpos";

const text = (b: Uint8Array) => String.fromCharCode(...b.filter((x) => x >= 0x20 || x === 0x0a));

describe("ESC/POS", () => {
  it("quita tildes y ñ para que se lea en cualquier impresora", () => {
    expect(toAscii("Ají de gallina · Ñoquis")).toBe("Aji de gallina  Noquis");
  });

  it("empieza inicializando y termina cortando el papel", () => {
    const b = new EscPos(48).line("hola").cut().build();
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...b.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("la comanda trae la mesa, cantidades, platos y la nota", () => {
    const t = text(
      comandaBytes({ label: "Mesa 5", at: new Date(), lines: [{ qty: 2, name: "Lomo saltado · término medio" }], note: "Sin cebolla", pending: true }),
    );
    expect(t).toContain("Mesa 5");
    expect(t).toContain("2 x Lomo saltado");
    expect(t).toContain("NOTA: Sin cebolla");
    expect(t).toContain("SIN CONEXION");
  });

  it("alinea importes a la derecha en el ancho del papel", () => {
    const b = ticketBytes(
      { business: "La Higuera", label: "Mesa 1", at: new Date(), lines: [{ qty: 1, name: "Pisco sour", total: 26 }], base: 22.03, tax: 3.97, taxLabel: "IGV 18%", total: 26 },
      32,
    );
    const rows = text(b).split("\n");
    const row = rows.find((r) => r.includes("Pisco sour"))!;
    expect(row.length).toBe(32);
    expect(row.endsWith("S/ 26.00")).toBe(true);
  });
});
