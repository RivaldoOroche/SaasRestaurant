import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);

describe("migraciones + seed en Postgres real", () => {
  it("aplican sin errores y cargan el seed", async () => {
    const { rows } = await db.query<{ n: number }>("select count(*)::int n from tenants");
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("instalar.sql (script único para Supabase)", () => {
  it("instalar.sql y demo.sql están al día con las migraciones y el seed (npm run db:bundle)", async () => {
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error módulo .mjs sin tipos
    const { buildInstaller, buildDemo } = await import("../../scripts/build-setup-sql.mjs");
    expect(readFileSync("supabase/instalar.sql", "utf8")).toBe(buildInstaller());
    expect(readFileSync("supabase/demo.sql", "utf8")).toBe(buildDemo());
  });

  it("instala en una base vacía, se puede volver a correr y carga la demo", async () => {
    const { readFileSync } = await import("node:fs");
    const { PGlite } = await import("@electric-sql/pglite");
    const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
    const fresh = new PGlite({ extensions: { pgcrypto } });
    await fresh.exec(readFileSync("supabase/tests/supabase_stub.sql", "utf8"));
    const installer = readFileSync("supabase/instalar.sql", "utf8");
    await fresh.exec(installer);
    const first = await fresh.query<{ estado: string; n: number }>(
      "select estado, count(*)::int n from wayra_migraciones group by estado",
    );
    expect(first.rows).toEqual([{ estado: "aplicada", n: expect.any(Number) }]);
    await fresh.exec(installer); // segunda corrida: no falla ni repite nada
    const again = await fresh.query<{ n: number }>("select count(*)::int n from wayra_migraciones where estado = 'aplicada'");
    expect(again.rows[0].n).toBe(first.rows[0].n);
    const plans = await fresh.query<{ tier: string; price: string }>("select tier, price from subscription_plans order by price");
    expect(plans.rows.map((r) => [r.tier, Number(r.price)])).toEqual([["Básico", 159], ["Pro", 299], ["Enterprise", 899]]);
    expect((await fresh.query<{ n: number }>("select count(*)::int n from tenants")).rows[0].n).toBe(0); // sin datos ficticios
    await fresh.exec(readFileSync("supabase/demo.sql", "utf8"));
    expect((await fresh.query<{ n: number }>("select count(*)::int n from tenants")).rows[0].n).toBe(6);
  }, 120_000);
});
