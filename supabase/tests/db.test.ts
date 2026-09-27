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

describe("setup_all.sql", () => {
  it("está al día con las migraciones y el seed (npm run db:bundle)", async () => {
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error módulo .mjs sin tipos
    const { bundle } = await import("../../scripts/build-setup-sql.mjs");
    expect(readFileSync("supabase/setup_all.sql", "utf8")).toBe(bundle());
  });
});
