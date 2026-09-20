// Importe en letras para comprobantes SUNAT, p.ej. 130.2 -> "CIENTO TREINTA CON 20/100".
// Portable (sin APIs de Deno/Node) para poder probarlo con Vitest.

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const ESPECIALES: Record<number, string> = {
  10: "DIEZ", 11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE",
  16: "DIECISÉIS", 17: "DIECISIETE", 18: "DIECIOCHO", 19: "DIECINUEVE", 20: "VEINTE",
};
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function decenas(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (ESPECIALES[n]) return ESPECIALES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (n < 30) return "VEINTI" + UNIDADES[u]; // 21-29: VEINTIUNO..VEINTINUEVE
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

function centenas(n: number): string {
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const pref = CENTENAS[c];
  const suf = resto ? decenas(resto) : "";
  return [pref, suf].filter(Boolean).join(" ");
}

function seccion(n: number, singular: string, plural: string): string {
  if (n === 0) return "";
  if (n === 1) return singular;
  return `${enteroALetras(n)} ${plural}`;
}

function enteroALetras(n: number): string {
  if (n === 0) return "CERO";
  if (n < 0) return "MENOS " + enteroALetras(-n);
  let out = "";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  if (millones) out += " " + seccion(millones, "UN MILLÓN", "MILLONES");
  if (miles) out += " " + (miles === 1 ? "MIL" : `${enteroALetras(miles)} MIL`);
  if (resto) out += " " + centenas(resto);
  return out.trim();
}

/** Devuelve el importe en letras estilo SUNAT (sin la moneda), p.ej. "CIENTO TREINTA CON 20/100". */
export function numeroALetras(monto: number): string {
  const entero = Math.floor(Math.abs(monto));
  const centimos = Math.round((Math.abs(monto) - entero) * 100);
  const letras = enteroALetras(entero);
  return `${letras} CON ${String(centimos).padStart(2, "0")}/100`;
}
