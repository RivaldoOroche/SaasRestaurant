// Codificador ESC/POS mínimo para impresoras térmicas de 80 mm (48 columnas)
// y 58 mm (32 columnas): texto, negrita, doble tamaño, alineación y corte.
// Las impresoras de bajo costo traen tablas de caracteres distintas; para que
// la comanda siempre se lea, las tildes y la ñ se imprimen sin acento.

const ESC = 0x1b;
const GS = 0x1d;

export type PaperWidth = 32 | 48;

/** "Ají de gallina" → "Aji de gallina" (seguro en cualquier tabla de caracteres). */
export function toAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .replace(/[^\x20-\x7e\n]/g, "");
}

export class EscPos {
  private bytes: number[] = [ESC, 0x40]; // inicializar
  constructor(readonly width: PaperWidth = 48) {}

  private push(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }
  align(a: "left" | "center" | "right") {
    return this.push(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  }
  bold(on: boolean) {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }
  /** Doble alto y ancho (títulos de comanda). */
  big(on: boolean) {
    return this.push(GS, 0x21, on ? 0x11 : 0x00);
  }
  /** Doble alto, mismo ancho: más legible sin perder columnas. */
  tall(on: boolean) {
    return this.push(GS, 0x21, on ? 0x01 : 0x00);
  }
  text(s: string) {
    for (const ch of toAscii(s)) this.bytes.push(ch.charCodeAt(0));
    return this;
  }
  line(s = "") {
    return this.text(s).push(0x0a);
  }
  /** Texto a la izquierda y a la derecha en la misma línea. */
  pair(left: string, right: string, cols = this.width) {
    const l = toAscii(left);
    const r = toAscii(right);
    const space = Math.max(1, cols - l.length - r.length);
    return this.line(l.length + r.length + 1 > cols ? `${l.slice(0, cols - r.length - 1)} ${r}` : l + " ".repeat(space) + r);
  }
  rule(ch = "-") {
    return this.line(ch.repeat(this.width));
  }
  /** Parte un texto largo en líneas del ancho del papel. */
  wrap(s: string, cols = this.width, indent = "") {
    const words = toAscii(s).split(/\s+/);
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > cols) {
        this.line(cur);
        cur = indent + w;
      } else cur = (cur ? cur + " " : "") + w;
    }
    if (cur) this.line(cur);
    return this;
  }
  feed(n = 3) {
    return this.push(ESC, 0x64, n);
  }
  cut() {
    return this.feed(4).push(GS, 0x56, 0x42, 0x00); // corte parcial
  }
  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export interface ComandaData {
  label: string; // "Mesa 5" / "🛵 D-1042"
  at: Date;
  lines: { qty: number; name: string }[];
  note?: string;
  waiter?: string;
  branch?: string;
  pending?: boolean; // enviada sin conexión
}

/** Comanda de cocina: grande y legible desde lejos. */
export function comandaBytes(c: ComandaData, width: PaperWidth = 48): Uint8Array {
  const p = new EscPos(width);
  p.align("center").big(true).bold(true).line(c.label).big(false).bold(false);
  p.line(c.at.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }));
  if (c.branch || c.waiter) p.line([c.branch, c.waiter].filter(Boolean).join(" · "));
  if (c.pending) p.bold(true).line("** SIN CONEXION: registrar al volver **").bold(false);
  p.align("left").rule("=");
  p.bold(true).tall(true);
  for (const l of c.lines) p.wrap(`${l.qty} x ${l.name}`, width, "    ");
  p.tall(false).bold(false);
  if (c.note) p.rule().wrap(`NOTA: ${c.note}`);
  return p.rule("=").cut().build();
}

export interface TicketData {
  business: string;
  ruc?: string;
  address?: string;
  folio?: string;
  label: string;
  at: Date;
  lines: { qty: number; name: string; total: number }[];
  base: number;
  tax: number;
  taxLabel: string;
  total: number;
  method?: string;
  footer?: string;
}

/** Ticket / pre-cuenta en impresora térmica. */
export function ticketBytes(t: TicketData, width: PaperWidth = 48, money = (n: number) => `S/ ${n.toFixed(2)}`): Uint8Array {
  const p = new EscPos(width);
  p.align("center").bold(true).line(t.business).bold(false);
  if (t.ruc) p.line(`RUC ${t.ruc}`);
  if (t.address) p.wrap(t.address);
  if (t.folio) p.bold(true).line(t.folio).bold(false);
  p.line(`${t.label} · ${t.at.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`);
  p.align("left").rule();
  for (const l of t.lines) p.pair(`${l.qty} ${l.name}`, money(l.total));
  p.rule();
  p.pair("Op. gravada", money(t.base));
  p.pair(t.taxLabel, money(t.tax));
  p.bold(true).pair("TOTAL", money(t.total)).bold(false);
  if (t.method) p.pair("Pago", t.method);
  if (t.footer) p.align("center").feed(1).wrap(t.footer);
  return p.cut().build();
}
