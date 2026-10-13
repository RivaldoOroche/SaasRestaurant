// Reporte del comedor en un rango de fechas: lo que se entregó y cobró, el
// dinero que entró (recargas y abonos), el aprovechamiento de raciones y la
// liquidación de convenios (lo que se factura al colegio o a la empresa).
import { round2 } from "./money";
import type { ComedorConsumo, ComedorMenuDay, ComedorReserva, Comensal, WalletMovement } from "@/data/model";

export interface ComedorReport {
  menus: number;
  /** Consumos cobrados (saldo + venta al paso), con IGV. */
  ventas: number;
  ventasMenu: number;
  ventasKiosko: number;
  porPago: { pago: string; count: number; total: number }[];
  recargas: { method: string; count: number; total: number }[];
  recargado: number;
  abonos: number;
  raciones: number;
  /** Raciones preparadas y no entregadas (días ya pasados o de hoy). */
  sobrantes: number;
  aprovechamiento: number | null;
  reservasNoRecogidas: number;
  topKiosko: { name: string; qty: number; total: number }[];
  porGrupo: { grupo: string; menus: number; kiosko: number }[];
  convenios: { comensalId: string; name: string; grupo: string; menus: number; total: number }[];
  totalConvenios: number;
  saldoMonederos: number;
}

export function comedorReport(
  input: {
    consumos: ComedorConsumo[];
    movimientos: WalletMovement[];
    menus: ComedorMenuDay[];
    reservas: ComedorReserva[];
    comensales: Comensal[];
  },
  from: string,
  to: string,
  today: string,
): ComedorReport {
  const inRange = (d: string) => d >= from && d <= to;
  const consumos = input.consumos.filter((k) => inRange(k.date));
  const menusEntregados = consumos.filter((k) => k.kind === "menu");
  const cobrados = consumos.filter((k) => k.pago !== "abono" && k.pago !== "convenio");
  const sum = (xs: { total: number }[]) => round2(xs.reduce((s, x) => s + x.total, 0));

  const pagos = new Map<string, { count: number; total: number }>();
  for (const k of consumos) {
    const p = pagos.get(k.pago) ?? { count: 0, total: 0 };
    p.count++;
    p.total = round2(p.total + k.total);
    pagos.set(k.pago, p);
  }

  const since = new Date(`${from}T00:00:00`).getTime();
  const until = new Date(`${to}T23:59:59.999`).getTime();
  const entradas = input.movimientos.filter((m) => {
    const t = Date.parse(m.at);
    return (m.kind === "recarga" || m.kind === "abono") && t >= since && t <= until;
  });
  const metodos = new Map<string, { count: number; total: number }>();
  for (const m of entradas) {
    const key = m.method ?? "otro";
    const x = metodos.get(key) ?? { count: 0, total: 0 };
    x.count++;
    x.total = round2(x.total + m.amount);
    metodos.set(key, x);
  }

  // Aprovechamiento: solo días que ya se sirvieron (hasta hoy).
  const servidos = input.menus.filter((m) => inRange(m.date) && m.date <= today);
  const raciones = servidos.reduce((s, m) => s + m.raciones, 0);
  const entregadosEnServidos = menusEntregados.filter((k) => servidos.some((m) => m.date === k.date)).length;

  const servedKey = new Set(menusEntregados.map((k) => `${k.comensalId}|${k.date}`));
  const reservasNoRecogidas = input.reservas.filter((r) => inRange(r.date) && r.date < today && !servedKey.has(`${r.comensalId}|${r.date}`)).length;

  const productos = new Map<string, { qty: number; total: number }>();
  for (const k of consumos.filter((x) => x.kind === "kiosko"))
    for (const i of k.items) {
      const p = productos.get(i.name) ?? { qty: 0, total: 0 };
      p.qty += i.qty;
      p.total = round2(p.total + i.qty * i.price);
      productos.set(i.name, p);
    }

  const grupos = new Map<string, { menus: number; kiosko: number }>();
  for (const k of consumos.filter((x) => x.comensalId)) {
    const g = grupos.get(k.grupo || "Sin grupo") ?? { menus: 0, kiosko: 0 };
    if (k.kind === "menu") g.menus++;
    else g.kiosko = round2(g.kiosko + k.total);
    grupos.set(k.grupo || "Sin grupo", g);
  }

  // Convenios: cada menú entregado se liquida al precio publicado ese día.
  const precio = new Map(input.menus.map((m) => [m.date, m.price]));
  const conv = new Map<string, { menus: number; total: number }>();
  for (const k of menusEntregados.filter((x) => x.pago === "convenio" && x.comensalId)) {
    const c = conv.get(k.comensalId!) ?? { menus: 0, total: 0 };
    c.menus++;
    c.total = round2(c.total + (precio.get(k.date) ?? k.items[0]?.price ?? 0));
    conv.set(k.comensalId!, c);
  }
  const byId = new Map(input.comensales.map((c) => [c.id, c]));
  const convenios = [...conv.entries()]
    .map(([id, v]) => ({ comensalId: id, name: byId.get(id)?.name ?? "—", grupo: byId.get(id)?.grupo ?? "", ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    menus: menusEntregados.length,
    ventas: sum(cobrados),
    ventasMenu: sum(cobrados.filter((k) => k.kind === "menu")),
    ventasKiosko: sum(cobrados.filter((k) => k.kind === "kiosko")),
    porPago: [...pagos.entries()].map(([pago, v]) => ({ pago, ...v })).sort((a, b) => b.count - a.count),
    recargas: [...metodos.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.total - a.total),
    recargado: sum(entradas.filter((m) => m.kind === "recarga").map((m) => ({ total: m.amount }))),
    abonos: sum(entradas.filter((m) => m.kind === "abono").map((m) => ({ total: m.amount }))),
    raciones,
    sobrantes: Math.max(0, raciones - entregadosEnServidos),
    aprovechamiento: raciones > 0 ? Math.round((entregadosEnServidos / raciones) * 1000) / 10 : null,
    reservasNoRecogidas,
    topKiosko: [...productos.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 8),
    porGrupo: [...grupos.entries()].map(([grupo, v]) => ({ grupo, ...v })).sort((a, b) => a.grupo.localeCompare(b.grupo)),
    convenios,
    totalConvenios: round2(convenios.reduce((s, c) => s + c.total, 0)),
    saldoMonederos: round2(input.comensales.filter((c) => c.active).reduce((s, c) => s + c.balance, 0)),
  };
}
