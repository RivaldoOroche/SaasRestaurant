// Reglas del comedor (colegios y empresas). Funciones puras: las usan el modo
// demo y la UI, y las mismas reglas aplica la base en comedor_despachar
// (migración 0046). Montos en soles con IGV incluido.
import { round2 } from "./money";

export type BusinessType = "restaurante" | "comedor";

/** Cómo paga el comensal su menú del día. */
export type ComedorPlan = "prepago" | "abono" | "convenio";
export type ComensalTipo = "alumno" | "docente" | "colaborador" | "otro";
/** Medio con el que se paga un consumo. */
export type ComedorPago = "saldo" | "abono" | "convenio" | "efectivo" | "yape" | "plin" | "tarjeta";

export const PLAN_LABEL: Record<ComedorPlan, string> = {
  prepago: "Saldo prepago",
  abono: "Abono mensual",
  convenio: "Convenio",
};
export const TIPO_LABEL: Record<ComensalTipo, string> = {
  alumno: "Alumno",
  docente: "Docente",
  colaborador: "Colaborador",
  otro: "Otro",
};

export interface ComedorRules {
  /** Colegio: no se vende nada con octógonos (Ley 30021). */
  bloquearOctogonos: boolean;
  /** Se entrega el menú sin reserva mientras queden raciones. */
  permitirSinReserva: boolean;
  /** Hora límite (HH:MM) del mismo día para reservar o anular. */
  cierreReservas: string;
}

export interface ComensalLike {
  name: string;
  plan: ComedorPlan;
  balance: number;
  /** Tope de consumo de kiosko por día (S/); null = sin tope. */
  dailyLimit: number | null;
  blockedCategoryIds: string[];
  /** Último día cubierto por el abono (YYYY-MM-DD). */
  abonoHasta: string | null;
  active: boolean;
}

export interface KioskoItem {
  name: string;
  qty: number;
  price: number;
  categoryId: string;
  octogonos: number;
}

/** Total de una lista de ítems. */
export function itemsTotal(items: { qty: number; price: number }[]): number {
  return round2(items.reduce((s, i) => s + i.qty * i.price, 0));
}

const fmt = (n: number) => `S/ ${n.toFixed(2)}`;

/**
 * Valida una compra de kiosko con saldo. Devuelve el motivo del rechazo o null.
 * `spentToday`: lo ya consumido hoy en kiosko (para el tope diario).
 */
export function kioskoBlock(
  c: ComensalLike,
  items: KioskoItem[],
  spentToday: number,
  rules: Pick<ComedorRules, "bloquearOctogonos">,
  categoryName: (id: string) => string = (id) => id,
): string | null {
  if (!c.active) return `${c.name} está inactivo.`;
  if (items.length === 0) return "Agrega al menos un producto.";
  if (rules.bloquearOctogonos) {
    const oct = items.find((i) => i.octogonos > 0);
    if (oct) return `«${oct.name}» tiene octógonos y no se vende en el colegio.`;
  }
  const blocked = items.find((i) => c.blockedCategoryIds.includes(i.categoryId));
  if (blocked) return `La familia bloqueó «${categoryName(blocked.categoryId)}» para ${c.name}.`;
  const total = itemsTotal(items);
  if (c.dailyLimit !== null && round2(spentToday + total) > c.dailyLimit) {
    const left = Math.max(0, round2(c.dailyLimit - spentToday));
    return `Supera el tope diario de ${fmt(c.dailyLimit)}: le quedan ${fmt(left)} hoy.`;
  }
  if (total > c.balance) return `Saldo insuficiente: tiene ${fmt(c.balance)} y la compra es ${fmt(total)}.`;
  return null;
}

/** ¿El abono cubre esta fecha? */
export function abonoVigente(c: Pick<ComensalLike, "plan" | "abonoHasta">, date: string): boolean {
  return c.plan === "abono" && !!c.abonoHasta && c.abonoHasta >= date;
}

export interface MenuCheck {
  ok: boolean;
  /** Cómo se paga si ok. */
  pago?: Extract<ComedorPago, "saldo" | "abono" | "convenio">;
  /** Importe que se descuenta del saldo (0 con abono o convenio). */
  cargo?: number;
  motivo?: string;
}

/**
 * Valida la entrega del menú del día: una ración por comensal y día, reserva
 * (o raciones libres) y forma de pago según su plan.
 */
export function menuCheck(
  c: ComensalLike,
  menu: { date: string; price: number; raciones: number } | null,
  st: { yaServido: boolean; reservado: boolean; servidos: number; reservasPendientes: number },
  rules: Pick<ComedorRules, "permitirSinReserva">,
): MenuCheck {
  if (!c.active) return { ok: false, motivo: `${c.name} está inactivo.` };
  if (!menu) return { ok: false, motivo: "Hoy no hay menú publicado." };
  if (st.yaServido) return { ok: false, motivo: `${c.name} ya recibió su menú hoy.` };
  if (!st.reservado) {
    if (!rules.permitirSinReserva) return { ok: false, motivo: `${c.name} no reservó el menú de hoy.` };
    // Las raciones reservadas y aún no entregadas están apartadas.
    const libres = menu.raciones - st.servidos - st.reservasPendientes;
    if (libres <= 0) return { ok: false, motivo: "No quedan raciones libres: las que quedan están reservadas." };
  }
  if (c.plan === "convenio") return { ok: true, pago: "convenio", cargo: 0 };
  if (abonoVigente(c, menu.date)) return { ok: true, pago: "abono", cargo: 0 };
  if (menu.price > c.balance) {
    const extra = c.plan === "abono" ? " (su abono venció)" : "";
    return { ok: false, motivo: `Saldo insuficiente${extra}: tiene ${fmt(c.balance)} y el menú cuesta ${fmt(menu.price)}.` };
  }
  return { ok: true, pago: "saldo", cargo: menu.price };
}

/** ¿Todavía se puede reservar o anular el menú de `date`? (hasta la hora de cierre del mismo día) */
export function puedeReservar(date: string, now: Date, cierre: string): boolean {
  const today = localDate(now);
  if (date > today) return true;
  if (date < today) return false;
  const [h, m] = cierre.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() < h * 60 + (m || 0);
}

/** Fecha local YYYY-MM-DD (sin desfase UTC). */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Días hábiles (lunes a viernes) desde `from` (incluido), `n` días. */
export function nextSchoolDays(from: Date, n: number): string[] {
  const out: string[] = [];
  const d = new Date(from);
  while (out.length < n) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) out.push(localDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Saldo bajo: para avisar a la familia. */
export function saldoBajo(balance: number, umbral: number): boolean {
  return balance < umbral;
}

/**
 * Lee un padrón pegado desde Excel o CSV (separado por tabulador, coma o
 * punto y coma). Columnas: código, nombre, grado/área, tipo, plan, alergias,
 * responsable, celular, correo. La primera fila puede ser el encabezado.
 */
export interface PadronRow {
  code: string;
  name: string;
  grupo: string;
  tipo: ComensalTipo;
  plan: ComedorPlan;
  allergies: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
}
export function parsePadron(text: string): { rows: PadronRow[]; errors: string[] } {
  const rows: PadronRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sep = (l: string) => (l.includes("\t") ? "\t" : l.includes(";") ? ";" : ",");
  lines.forEach((line, i) => {
    const cols = line.split(sep(line)).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /c[oó]digo|nombre/i.test(cols[0] + cols[1])) return; // encabezado
    const [code, name, grupo = "", tipo = "", plan = "", allergies = "", guardianName = "", guardianPhone = "", guardianEmail = ""] = cols;
    if (!code || !name) {
      errors.push(`Fila ${i + 1}: falta el código o el nombre.`);
      return;
    }
    const t = tipo.toLowerCase();
    const p = plan.toLowerCase();
    rows.push({
      code,
      name,
      grupo,
      tipo: (["alumno", "docente", "colaborador", "otro"] as const).find((x) => t.startsWith(x.slice(0, 4))) ?? "alumno",
      plan: p.startsWith("abon") ? "abono" : p.startsWith("conv") ? "convenio" : "prepago",
      allergies,
      guardianName,
      guardianPhone: guardianPhone.replace(/\D/g, ""),
      guardianEmail,
    });
  });
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.code)) errors.push(`El código ${r.code} se repite en el padrón.`);
    seen.add(r.code);
  }
  return { rows, errors };
}
