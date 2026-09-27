// Reglas de la carta compartidas por el editor y los backends.
import type { MenuItemInput } from "@/data/model";

/** Mensaje legible si el plato no se puede guardar, o null. */
export function validateMenuItem(i: Pick<MenuItemInput, "name" | "price" | "categoryId">): string | null {
  if (!i.name.trim()) return "Escribe el nombre del plato.";
  if (!i.categoryId) return "Elige una categoría.";
  if (!(i.price >= 0) || !Number.isFinite(i.price)) return "Escribe un precio válido.";
  if (i.price > 99999) return "El precio parece demasiado alto; revísalo.";
  return null;
}

/** Margen bruto en % sobre el precio con IGV incluido (null si no hay precio). */
export function marginPct(price: number, cost: number): number | null {
  return price > 0 ? Math.round(((price - cost) / price) * 100) : null;
}

/** Semáforo del food cost: meta usual de restaurantes ≈ 30-35 % del precio. */
export function foodCostTone(price: number, cost: number): "success" | "warning" | "neutral" {
  if (!price || !cost) return "neutral";
  const pct = (cost / price) * 100;
  return pct <= 35 ? "success" : pct <= 45 ? "warning" : "neutral";
}

/** Clave única y legible a partir de un nombre ("Ceviches" → "ceviches", "ceviches-2"). */
/** Mismo nombre ignorando mayúsculas, tildes y espacios de más. */
export function sameName(a: string, b: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
  return n(a) === n(b);
}

export function slugKey(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  return key;
}
