// Banco de pruebas de base de datos: aplica el stub de Supabase + TODAS las
// migraciones + seed sobre un Postgres real embebido (PGlite), y permite
// ejecutar consultas "como" un usuario autenticado para probar RLS de verdad.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "supabase");

export async function createDb(opts: { seed?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(ROOT, "tests", "supabase_stub.sql"), "utf8"));
  const migrations = readdirSync(join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of migrations) {
    try {
      await db.exec(readFileSync(join(ROOT, "migrations", f), "utf8"));
    } catch (e) {
      throw new Error(`Migración ${f} falló: ${(e as Error).message}`);
    }
  }
  if (opts.seed !== false) await db.exec(readFileSync(join(ROOT, "seed.sql"), "utf8"));
  return db;
}

/**
 * Ejecuta `fn` como un usuario autenticado (rol `authenticated` + JWT con `sub`),
 * igual que PostgREST en Supabase. Las políticas RLS se aplican de verdad.
 */
export async function asUser<T>(db: PGlite, userId: string | null, fn: (q: PGlite["query"]) => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await db.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    const out = await fn(db.query.bind(db));
    await db.exec("commit");
    return out;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}

/** Crea un usuario de Auth y su membresía en un tenant (como service role). */
export async function makeUser(db: PGlite, email: string, tenantId: string | null, role: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
  const id = rows[0].id;
  await db.query(`insert into memberships (user_id, tenant_id, role) values ($1, $2, $3)`, [id, tenantId, role]);
  return id;
}
