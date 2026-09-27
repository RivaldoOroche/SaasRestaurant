import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb, asUser, makeUser } from "./harness";

// Árbol de sucursales + cuota por plan + integridad multi-tenant, en Postgres real.

const HIGUERA = "11111111-1111-1111-1111-111111111111";
const MUELLE = "a0000000-0000-0000-0000-000000000002";
const FAROL = "a0000000-0000-0000-0000-000000000004"; // plan Básico
const MIRAFLORES = "22222222-0000-0000-0000-000000000001";

let db: PGlite;
let farolOwner: string;
let higueraOwner: string;
let higueraMesero: string;

const rootOf = async (tenant: string) =>
  (await db.query<{ id: string }>(`select app.root_branch($1) id`, [tenant])).rows[0].id;

beforeAll(async () => {
  db = await createDb();
  farolOwner = await makeUser(db, "raul@farol.pe", FAROL, "dueno");
  higueraOwner = await makeUser(db, "monica@lahiguera.pe", HIGUERA, "dueno");
  higueraMesero = await makeUser(db, "ana@lahiguera.pe", HIGUERA, "mesero");
}, 60_000);

describe("árbol de sucursales", () => {
  it("cada restaurante nace con su sede principal (raíz única)", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into tenants (name, slug, owner_name, plan) values ('Nuevo', 'nuevo-x', 'Ana', 'Básico') returning id`,
    );
    const branches = await db.query<{ name: string; parent_id: string | null }>(
      `select name, parent_id from branches where tenant_id = $1`,
      [rows[0].id],
    );
    expect(branches.rows).toEqual([{ name: "Nuevo", parent_id: null }]);
    await expect(
      db.query(`insert into branches (tenant_id, name) values ($1, 'Otra raíz')`, [rows[0].id]),
    ).rejects.toThrow(/branches_one_root/);
  });

  it("el seed arma La Higuera como principal (Miraflores) + sucursal (San Isidro)", async () => {
    const { rows } = await db.query<{ name: string; parent: string | null }>(
      `select b.name, p.name parent from branches b left join branches p on p.id = b.parent_id
       where b.tenant_id = $1 order by b.parent_id nulls first`,
      [HIGUERA],
    );
    expect(rows).toEqual([
      { name: "Miraflores", parent: null },
      { name: "San Isidro", parent: "Miraflores" },
    ]);
  });

  it("no permite ciclos, ni colgar la principal, ni padres de otro restaurante", async () => {
    const root = await rootOf(MUELLE);
    const { rows } = await db.query<{ id: string }>(
      `insert into branches (tenant_id, parent_id, name) values ($1, $2, 'Hija') returning id`,
      [MUELLE, root],
    );
    const child = rows[0].id;
    await expect(db.query(`update branches set parent_id = $1 where id = $2`, [child, root])).rejects.toThrow(
      /principal no puede depender/,
    );
    await expect(db.query(`update branches set parent_id = $1 where id = $1`, [child])).rejects.toThrow();
    await expect(
      db.query(`insert into branches (tenant_id, parent_id, name) values ($1, $2, 'Intrusa')`, [MUELLE, MIRAFLORES]),
    ).rejects.toThrow(/branches_parent_fk/);
    await db.query(`delete from branches where id = $1`, [child]);
  });

  it("la principal no se borra; una sucursal con mesas tampoco (se desactiva)", async () => {
    await expect(db.query(`delete from branches where id = $1`, [MIRAFLORES])).rejects.toThrow(/principal/);
    await expect(
      db.query(`delete from branches where id = '22222222-0000-0000-0000-000000000002'`),
    ).rejects.toThrow(/desactívala/);
  });

  it("borrar un restaurante elimina su árbol completo", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into tenants (name, slug, owner_name, plan) values ('Temporal', 'temporal-x', 'Ana', 'Pro') returning id`,
    );
    const root = await rootOf(rows[0].id);
    await db.query(`insert into branches (tenant_id, parent_id, name) values ($1, $2, 'A'), ($1, $2, 'B')`, [
      rows[0].id,
      root,
    ]);
    await db.query(`delete from tenants where id = $1`, [rows[0].id]);
    const left = await db.query(`select 1 from branches where tenant_id = $1`, [rows[0].id]);
    expect(left.rows).toHaveLength(0);
  });
});

describe("cuota de sucursales por plan", () => {
  it("Básico es para un solo local: la primera sucursal se rechaza con mensaje claro", async () => {
    const root = await rootOf(FAROL);
    await expect(
      asUser(db, farolOwner, (q) => q(`insert into branches (tenant_id, parent_id, name) values ($1, $2, 'Surco')`, [FAROL, root])),
    ).rejects.toThrow(/plan Básico es para un solo local. Pasa al plan Pro/);
    const quota = await asUser(db, farolOwner, (q) =>
      q<{ q: { used: number; max: number; remaining: number } }>(`select branch_quota($1) q`, [FAROL]),
    );
    expect(quota.rows[0].q).toMatchObject({ plan: "Básico", used: 0, max: 0, remaining: 0 });
  });

  it("Pro: 2 locales incluidos, S/ 119 por local adicional y hasta 5 locales", async () => {
    const root = await rootOf(FAROL);
    await db.query(`update tenants set plan = 'Pro' where id = $1`, [FAROL]);
    await asUser(db, farolOwner, (q) =>
      q(`insert into branches (tenant_id, parent_id, name) values ($1, $2, 'Surco'), ($1, $2, 'Barranco')`, [FAROL, root]),
    );
    const t = await db.query<{ plan_total: string }>(`select plan_total from v_tenants where id = $1`, [FAROL]);
    expect(Number(t.rows[0].plan_total)).toBe(299 + 119); // 3 locales
    await db.query(`insert into branches (tenant_id, parent_id, name) values ($1, $2, 'La Molina'), ($1, $2, 'Chorrillos')`, [FAROL, root]);
    await expect(
      db.query(`insert into branches (tenant_id, parent_id, name) values ($1, $2, 'Lince')`, [FAROL, root]),
    ).rejects.toThrow(/plan Pro permite hasta 5 locales/);
    const q = await asUser(db, farolOwner, (qq) =>
      qq<{ q: { included: number; extra: number; monthly_total: string } }>(`select branch_quota($1) q`, [FAROL]),
    );
    expect(q.rows[0].q).toMatchObject({ included: 1, extra: 3 });
    expect(Number(q.rows[0].q.monthly_total)).toBe(299 + 3 * 119);
  });

  it("desactivar libera cupo; reactivar por encima del límite se rechaza", async () => {
    const root = await rootOf(FAROL);
    await db.query(`update branches set active = false where tenant_id = $1 and name = 'Surco'`, [FAROL]);
    await db.query(`insert into branches (tenant_id, parent_id, name) values ($1, $2, 'Lince')`, [FAROL, root]);
    await expect(
      db.query(`update branches set active = true where tenant_id = $1 and name = 'Surco'`, [FAROL]),
    ).rejects.toThrow(/plan_limit|hasta 5 locales/);
  });

  it("bajar a Básico con sucursales activas se bloquea", async () => {
    await expect(db.query(`update tenants set plan = 'Básico' where id = $1`, [FAROL])).rejects.toThrow(
      /permite un solo local y el restaurante tiene 4 sucursales activas. Desactiva 4/,
    );
  });

  it("el mesero no crea sucursales (solo gerencia)", async () => {
    await expect(
      asUser(db, higueraMesero, (q) =>
        q(`insert into branches (tenant_id, parent_id, name) values ($1, $2, 'X')`, [HIGUERA, MIRAFLORES]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("carta por sucursal", () => {
  it("la gerencia fija precio por sucursal; el mesero no; la carta pública oculta archivados", async () => {
    const item = (await db.query<{ id: string; name: string }>(
      `select id, name from menu_items where tenant_id = $1 order by sort limit 1`, [HIGUERA])).rows[0];
    await asUser(db, higueraOwner, (q) =>
      q(`insert into menu_item_branch (tenant_id, branch_id, item_id, price) values ($1, $2, $3, 99)`, [HIGUERA, MIRAFLORES, item.id]),
    );
    await expect(
      asUser(db, higueraMesero, (q) =>
        q(`update menu_item_branch set price = 1 where item_id = $1 returning 1`, [item.id]).then((r) => {
          if (r.rows.length === 0) throw new Error("row-level security");
        }),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.query(`insert into menu_item_branch (tenant_id, branch_id, item_id, price) values ($1, $2, $3, 5)`, [MUELLE, MIRAFLORES, item.id]),
    ).rejects.toThrow();
    await db.query(`update menu_items set archived = true where id = $1`, [item.id]);
    const { rows } = await db.query<{ m: { items: { id: string }[] } }>(`select public.public_menu('la-higuera') m`);
    expect(rows[0].m.items.some((i) => i.id === item.id)).toBe(false);
  });
});

describe("Enterprise: locales incluidos y adicionales", () => {
  it("6 locales incluidos; cada sucursal activa adicional suma S/ 99 al MRR y a la cuota", async () => {
    const root = await rootOf(MUELLE);
    const existing = (await db.query<{ n: number }>(
      `select count(*)::int n from branches where tenant_id = $1 and parent_id is not null and active`, [MUELLE])).rows[0].n;
    for (let i = existing; i < 7; i++) {
      await db.query(`insert into branches (tenant_id, parent_id, name) values ($1, $2, $3)`, [MUELLE, root, `Local ${i + 1}`]);
    }
    const t = await db.query<{ plan_total: string }>(`select plan_total from v_tenants where id = $1`, [MUELLE]);
    expect(Number(t.rows[0].plan_total)).toBe(899 + 2 * 99); // 8 locales
    const owner = await makeUser(db, "andres@muelle.pe", MUELLE, "dueno");
    const q = await asUser(db, owner, (qq) => qq<{ q: { included: number; extra: number; monthly_total: string } }>(
      `select branch_quota($1) q`, [MUELLE]));
    expect(q.rows[0].q).toMatchObject({ included: 5, extra: 2 });
    expect(Number(q.rows[0].q.monthly_total)).toBe(1097);
    // Desactivar una sucursal baja el cobro.
    await db.query(`update branches set active = false where tenant_id = $1 and name = 'Local 7'`, [MUELLE]);
    const t2 = await db.query<{ plan_total: string }>(`select plan_total from v_tenants where id = $1`, [MUELLE]);
    expect(Number(t2.rows[0].plan_total)).toBe(998);
  });
});

describe("integridad y normalización", () => {
  it("una fila operativa no puede apuntar a la sucursal de otro restaurante", async () => {
    await expect(
      db.query(`insert into restaurant_tables (tenant_id, branch_id, number) values ($1, $2, 99)`, [MUELLE, MIRAFLORES]),
    ).rejects.toThrow(/restaurant_tables_branch_fk/);
  });

  it("sin sucursal explícita, la operación cae en la sede principal", async () => {
    const { rows } = await db.query<{ branch_id: string }>(
      `insert into reservations (tenant_id, name, party_size, zone, res_date, at_time)
       values ($1, 'Ana', 2, 'Terraza', current_date, '20:00') returning branch_id`,
      [HIGUERA],
    );
    expect(rows[0].branch_id).toBe(MIRAFLORES);
  });

  it("las mesas se numeran por sucursal (dos locales pueden tener su Mesa 1)", async () => {
    const other = await rootOf(MUELLE);
    await db.query(`insert into restaurant_tables (tenant_id, branch_id, number) values ($1, $2, 1)`, [MUELLE, other]);
    await expect(
      db.query(`insert into restaurant_tables (tenant_id, branch_id, number) values ($1, $2, 1)`, [HIGUERA, MIRAFLORES]),
    ).rejects.toThrow(/restaurant_tables_branch_number_key/);
  });

  it("el MRR se deriva del plan (sin columna duplicada)", async () => {
    const cols = await db.query(`select 1 from information_schema.columns where table_name = 'tenants' and column_name = 'mrr'`);
    expect(cols.rows).toHaveLength(0);
    const { rows } = await asUser(db, higueraOwner, (q) =>
      q<{ mrr: string }>(`select mrr from v_tenants where id = $1`, [HIGUERA]),
    );
    expect(Number(rows[0].mrr)).toBe(299); // Pro con 2 locales (Miraflores + San Isidro), ambos incluidos
  });

  it("el inventario es por sucursal y el stock es la suma del kardex", async () => {
    const { rows } = await db.query<{ branch: string; qty: string; sum: string }>(
      `select b.name branch, s.qty, (select sum(delta) from inventory_movements m
         where m.branch_id = s.branch_id and m.item_id = s.item_id) sum
       from inventory_stock s join inventory_items i on i.id = s.item_id join branches b on b.id = s.branch_id
       where i.name = 'Pescado fresco' order by b.name`,
    );
    expect(rows.map((r) => [r.branch, Number(r.qty)])).toEqual([
      ["Miraflores", 18],
      ["San Isidro", 9],
    ]);
    expect(rows.every((r) => Number(r.qty) === Number(r.sum))).toBe(true);
  });

  it("tablas sin uso eliminadas y operativas publicadas en Realtime", async () => {
    const gone = await db.query(
      `select table_name from information_schema.tables
       where table_name in ('online_orders', 'sunat_credentials', 'payroll_entries')`,
    );
    expect(gone.rows).toHaveLength(0);
    const pub = await db.query<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`,
    );
    expect(pub.rows.map((r) => r.tablename)).toEqual(["cash_sessions", "delivery_orders", "kitchen_tickets", "orders", "restaurant_tables"]);
  });

  it("todas las políticas usan InitPlan (sin funciones evaluadas por fila)", async () => {
    const { rows } = await db.query<{ t: string; expr: string }>(
      `select tablename t, coalesce(qual, '') || ' ' || coalesce(with_check, '') expr
       from pg_policies where schemaname = 'public'`,
    );
    const perRow = rows.filter(
      (r) => /app\.(has_tenant|can_manage)\(/.test(r.expr) || /(?<!SELECT )auth\.uid\(\)/.test(r.expr),
    );
    expect(perRow.map((r) => r.t)).toEqual([]);
  });
});
