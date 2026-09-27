import type { InventoryItem, InventoryMovement, InventoryStatus } from "@/data/model";

/** Bajo = menos del 40 % del stock ideal (par). */
export function inventoryStatus(i: Pick<InventoryItem, "stock" | "par">): InventoryStatus {
  if (i.stock <= 0) return "agotado";
  if (i.stock < i.par * 0.4) return "bajo";
  return "ok";
}

/** Cantidades con hasta 3 decimales, sin ceros de relleno ("2.5", "0.125"). */
export function fmtQty(n: number): string {
  return (Math.round(n * 1000) / 1000).toLocaleString("es-PE", { maximumFractionDigits: 3 });
}

/** Lee "1,5" o "1.5". Devuelve NaN si no es un número. */
export function parseQty(s: string): number {
  const t = s.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

export const MOVEMENT_LABEL: Record<InventoryMovement["reason"], string> = {
  inicial: "Stock inicial",
  venta: "Venta",
  ajuste: "Conteo / ajuste",
  merma: "Merma",
  compra: "Compra",
  traslado: "Traslado",
};

export const UNITS = ["kg", "g", "l", "ml", "und", "docena", "paquete", "lata", "botella", "atado"];
