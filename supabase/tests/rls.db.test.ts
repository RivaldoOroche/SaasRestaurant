import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb, asUser, makeUser } from "./harness";

// Aislamiento multi-tenant probado en un Postgres real (no análisis de texto):
// cada restaurante solo ve lo suyo; la plataforma ve todo; anónimo no ve nada.

const HIGUERA = "11111111-1111-1111-1111-111111111111";
const MUELLE = "a0000000-0000-0000-0000-000000000002";

let db: PGlite;
let owner: string; // dueño de La Higuera
let rival: string; // dueño de El Muelle
let mesero: string; // mesero de La Higuera
let saas: string; // dueño de la plataforma

beforeAll(async () => {
  db = await createDb();
  owner = await makeUser(db, "monica@lahiguera.pe", HIGUERA, "dueno");
  rival = await makeUser(db, "andres@muelle.pe", MUELLE, "dueno");
  mesero = await makeUser(db, "ana@lahiguera.pe", HIGUERA, "mesero");
  saas = await makeUser(db, "admin@wayrapos.pe", null, "saas");
  // Un pedido en cada restaurante (como service: sin RLS).
  for (const t of [HIGUERA, MUELLE]) {
    await db.query(
      `insert into orders (tenant_id, branch_id, status) values ($1, (select id from branches where tenant_id = $1 limit 1), 'abierta')`,
      [t],
    );
  }
}, 60_000);

const count = (q: PGlite["query"], table: string) =>
  q<{ n: number }>(`select count(*)::int n from ${table}`).then((r) => r.rows[0].n);

describe("RLS en Postgres real", () => {
  it("un restaurante solo ve sus propios pedidos", async () => {
    const mine = await asUser(db, owner, (q) => q<{ tenant_id: string }>("select tenant_id from orders"));
    expect(mine.rows.length).toBe(1);
    expect(mine.rows.every((r) => r.tenant_id === HIGUERA)).toBe(true);
    const theirs = await asUser(db, rival, (q) => q<{ tenant_id: string }>("select tenant_id from orders"));
    expect(theirs.rows.every((r) => r.tenant_id === MUELLE)).toBe(true);
  });

  it("no puede escribir en el tenant de otro", async () => {
    await expect(
      asUser(db, owner, (q) => q(`insert into orders (tenant_id, status) values ($1, 'abierta')`, [MUELLE])),
    ).rejects.toThrow(/row-level security/);
  });

  it("la plataforma ve todos los tenants; anónimo no ve pedidos", async () => {
    expect(await asUser(db, saas, (q) => count(q, "orders"))).toBe(2);
    expect(await asUser(db, null, (q) => count(q, "orders"))).toBe(0);
  });

  it("el mesero no modifica la configuración del negocio (solo gerencia)", async () => {
    const res = await asUser(db, mesero, (q) =>
      q(`update business_settings set tax_rate = 10 where tenant_id = $1 returning 1`, [HIGUERA]),
    );
    expect(res.rows.length).toBe(0);
  });

  it("las credenciales secretas no se pueden leer ni siendo dueño", async () => {
    await db.query(`insert into fiscal_credentials (tenant_id, provider, sol_pass) values ($1, 'sunat_directo', 'secreto')`, [HIGUERA]);
    expect(await asUser(db, owner, (q) => count(q, "fiscal_credentials"))).toBe(0);
  });

  it("la carta pública funciona sin sesión y no expone datos internos", async () => {
    const r = await asUser(db, null, (q) => q<{ m: { tenant_name: string } }>(`select public_menu('la-higuera') m`));
    expect(r.rows[0].m.tenant_name).toBe("La Higuera");
    expect(JSON.stringify(r.rows[0].m)).not.toMatch(/mrr|owner_name/);
  });
});
