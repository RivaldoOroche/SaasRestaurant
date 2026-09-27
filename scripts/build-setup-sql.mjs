// Genera supabase/setup_all.sql = todas las migraciones (en orden) + seed.sql.
// Uso: npm run db:bundle   (un test en CI falla si el archivo quedó desactualizado)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function bundle(root = process.cwd()) {
  const dir = join(root, "supabase", "migrations");
  const out = [
    "-- =====================================================================",
    "-- Wayra POS - Script unico de instalacion (todo en uno)",
    "-- =====================================================================",
    "-- Concatena las migraciones (0001 -> ultima) + seed.sql. Pegar UNA vez",
    "-- en el SQL Editor de Supabase y Run. Luego Auth + memberships (SUPABASE_SETUP.md).",
    "-- ARCHIVO GENERADO: no editar a mano (npm run db:bundle).",
    "-- =====================================================================",
    "",
  ];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    out.push("", "-- ==================================================================", `-- Migracion ${f}`,
      "-- ==================================================================", "", readFileSync(join(dir, f), "utf8").trimEnd());
  }
  out.push("", "-- ==================================================================", "-- seed.sql",
    "-- ==================================================================", "", readFileSync(join(root, "supabase", "seed.sql"), "utf8").trimEnd(), "");
  return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(join(process.cwd(), "supabase", "setup_all.sql"), bundle());
  console.log("supabase/setup_all.sql actualizado");
}
