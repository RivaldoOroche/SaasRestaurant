// Arqueo de caja: esperado por método para un turno. Espejo de
// app.cash_expected (0038): ventas cobradas en la sucursal entre la apertura y
// el cierre; el efectivo suma el fondo inicial y los ingresos/egresos.
import type { CashSession, Order } from "@/data/model";

const r2 = (n: number) => Math.round(n * 100) / 100;

export const CASH_METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
  app: "Pagado en app (delivery)",
};

export function cashExpected(c: CashSession, orders: Order[], until: string = new Date().toISOString()): Record<string, number> {
  const out: Record<string, number> = { efectivo: 0 };
  for (const o of orders) {
    if (o.status !== "cobrada" || (o.branchId ?? null) !== (c.branchId ?? null)) continue;
    const at = o.closedAt ?? o.openedAt;
    if (at < c.openedAt || at > until) continue;
    const m = o.paidMethod ?? "efectivo";
    out[m] = r2((out[m] ?? 0) + (o.paidTotal ?? 0));
  }
  out.efectivo = r2(out.efectivo + c.openingFloat + cashNetMovements(c));
  return out;
}

export function cashNetMovements(c: Pick<CashSession, "movements">): number {
  return r2(c.movements.reduce((s, m) => s + (m.kind === "ingreso" ? m.amount : -m.amount), 0));
}

/** Diferencia total (contado − esperado); positiva = sobra, negativa = falta. */
export function cashDifference(expected: Record<string, number>, counted: Record<string, number>): number {
  return r2(Object.keys(expected).reduce((s, k) => s + (counted[k] ?? 0) - expected[k], 0));
}
