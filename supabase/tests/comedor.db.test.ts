import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb, asUser, makeUser } from "./harness";

// Comedores (migración 0046) en Postgres real: planes por tipo de negocio,
// cuota de comensales, monedero, despacho con sus reglas y portal de familias.

let db: PGlite;
let tenant: string;
let owner: string;
let cajero: string;
let catSaludable: string;
let catSnacks: string;
let fruta: string;
let galleta: string;
let token: string;
let today: string;
let tomorrow: string;
let yesterday: string;
const ids: Record<string, string> = {};

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const asCajero = <T>(fn: (q: PGlite["query"]) => Promise<T>) => asUser(db, cajero, fn);
const asOwner = <T>(fn: (q: PGlite["query"]) => Promise<T>) => asUser(db, owner, fn);
const despachar = (p: Record<string, unknown>) =>
  asCajero((q) => q<{ r: Record<string, unknown> }>(`select public.comedor_despachar($1, $2::jsonb) r`, [tenant, JSON.stringify(p)])).then((x) => x.rows[0].r);
const balance = async (id: string) => Number((await one<{ b: string }>(`select balance b from comensales where id = $1`, [id])).b);

beforeAll(async () => {
  db = await createDb();
  const d = await one<{ t: string; m: string; y: string }>(`select app.lima_today()::text t, (app.lima_today() + 1)::text m, (app.lima_today() - 1)::text y`);
  [today, tomorrow, yesterday] = [d.t, d.m, d.y];
  tenant = (await one<{ id: string }>(
    `insert into tenants (name, slug, owner_name, plan, business_type) values ('Colegio San Martín', 'colegio-sm', 'Rosa', 'Comedor', 'comedor') returning id`,
  )).id;
  await db.query(`insert into business_settings (tenant_id, name, yape_number) values ($1, 'Comedor San Martín', '987654321')`, [tenant]);
  owner = await makeUser(db, "rosa@colegio.pe", tenant, "dueno");
  cajero = await makeUser(db, "caja@colegio.pe", tenant, "mesero");
  catSaludable = (await one<{ id: string }>(`insert into menu_categories (tenant_id, key, name) values ($1, 'sal', 'Saludables') returning id`, [tenant])).id;
  catSnacks = (await one<{ id: string }>(`insert into menu_categories (tenant_id, key, name) values ($1, 'snk', 'Snacks') returning id`, [tenant])).id;
  fruta = (await one<{ id: string }>(`insert into menu_items (tenant_id, category_id, name, price) values ($1, $2, 'Fruta picada', 3) returning id`, [tenant, catSaludable])).id;
  galleta = (await one<{ id: string }>(`insert into menu_items (tenant_id, category_id, name, price, octogonos) values ($1, $2, 'Galleta rellena', 2, 2) returning id`, [tenant, catSnacks])).id;
  const resp = await one<{ id: string; portal_token: string }>(`insert into responsables (tenant_id, name, phone) values ($1, 'Rosa Ramos', '987111222') returning id, portal_token`, [tenant]);
  token = resp.portal_token;
  for (const [code, name, plan] of [["A1", "Lucía", "prepago"], ["A2", "Mateo", "prepago"], ["A3", "Sofía", "abono"], ["D1", "Prof. Díaz", "convenio"]]) {
    ids[code] = (await one<{ id: string }>(
      `insert into comensales (tenant_id, code, name, plan, grupo, responsable_id, daily_limit) values ($1, $2, $3, $4, '3.° B', $5, 8) returning id`,
      [tenant, code, name, plan, code === "A1" || code === "A2" ? resp.id : null],
    )).id;
  }
}, 60_000);

describe("planes por tipo de negocio", () => {
  it("un restaurante no toma un plan de comedor ni al revés", async () => {
    await expect(db.query(`insert into tenants (name, slug, owner_name, plan, business_type) values ('X', 'x-1', 'A', 'Pro', 'comedor')`))
      .rejects.toThrow(/es para restaurantes/);
    await expect(db.query(`update tenants set plan = 'Comedor' where slug = 'la-higuera'`)).rejects.toThrow(/es para comedores/);
  });

  it("cobra por bloques de 100 comensales sobre los incluidos (Institucional)", async () => {
    const t = (await one<{ id: string }>(
      `insert into tenants (name, slug, owner_name, plan, business_type) values ('Red', 'red-1', 'A', 'Comedor Institucional', 'comedor') returning id`,
    )).id;
    await db.query(`insert into comensales (tenant_id, code, name) select $1, 'C' || g, 'C' || g from generate_series(1, 2150) g`, [t]);
    expect(Number((await one<{ v: string }>(`select app.plan_monthly_total($1) v`, [t])).v)).toBe(969); // 899 + 2 × 35
  });

  it("el plan Comedor llega hasta 300 comensales activos", async () => {
    const t = (await one<{ id: string }>(
      `insert into tenants (name, slug, owner_name, plan, business_type) values ('Chico', 'chico-1', 'A', 'Comedor', 'comedor') returning id`,
    )).id;
    await db.query(`insert into comensales (tenant_id, code, name) select $1, 'C' || g, 'C' || g from generate_series(1, 300) g`, [t]);
    await expect(db.query(`insert into comensales (tenant_id, code, name) values ($1, 'X', 'X')`, [t])).rejects.toThrow(/hasta 300 comensales/);
    await db.query(`insert into comensales (tenant_id, code, name, active) values ($1, 'Y', 'Y', false)`, [t]); // inactivos no cuentan
  });
});

describe("monedero", () => {
  it("el saldo no se edita directo, ni siquiera el dueño", async () => {
    await expect(asOwner((q) => q(`update comensales set balance = 999 where id = $1`, [ids.A1]))).rejects.toThrow(/solo cambia/);
    await expect(asCajero((q) => q(`insert into comensales (tenant_id, code, name) values ($1, 'Z', 'Z')`, [tenant]))).rejects.toThrow();
  });

  it("recargar en efectivo exige la caja abierta y entra a la caja", async () => {
    const recargar = (amount: number, method = "efectivo") =>
      asCajero((q) => q(`select public.comedor_recargar($1, $2, $3, $4, '', 'Caja')`, [tenant, ids.A1, amount, method]));
    await expect(recargar(30)).rejects.toThrow(/Abre la caja/);
    const branch = (await one<{ id: string }>(`select app.root_branch($1) id`, [tenant])).id;
    await db.query(`insert into cash_sessions (id, tenant_id, branch_id, opened_at, opening_float) values (gen_random_uuid(), $1, $2, now(), 50)`, [tenant, branch]);
    await recargar(30);
    await recargar(10, "yape");
    expect(await balance(ids.A1)).toBe(40);
    const mov = await one<{ n: string; s: string }>(`select count(*) n, sum(amount) s from cash_movements where tenant_id = $1`, [tenant]);
    expect([Number(mov.n), Number(mov.s)]).toEqual([1, 30]); // el Yape no pasa por la caja
    await asCajero((q) => q(`select public.comedor_recargar($1, $2, 20, 'yape', '', 'Caja')`, [tenant, ids.A2]));
  });

  it("el abono extiende la cobertura sin sumar saldo; el ajuste es solo de gerencia", async () => {
    await asCajero((q) => q(`select public.comedor_recargar($1, $2, 220, 'transferencia', '', 'Caja', null, '2099-12-31')`, [tenant, ids.A3]));
    const c = await one<{ abono_hasta: string; balance: string }>(`select abono_hasta::text, balance from comensales where id = $1`, [ids.A3]);
    expect([c.abono_hasta, Number(c.balance)]).toEqual(["2099-12-31", 0]);
    await expect(asCajero((q) => q(`select public.comedor_ajustar($1, $2, 5, 'x', 'Caja')`, [tenant, ids.A3]))).rejects.toThrow(/dueño o el gerente/);
    await expect(asOwner((q) => q(`select public.comedor_ajustar($1, $2, -5, 'devolución', 'Rosa')`, [tenant, ids.A3]))).rejects.toThrow(/negativo/);
  });
});

describe("despacho", () => {
  it("kiosko: precio de la carta, sin octógonos, dentro del tope y del saldo", async () => {
    const r = await despachar({ comensal_id: ids.A1, kind: "kiosko", items: [{ menu_item_id: fruta, qty: 2, price: 0.01 }] });
    expect(Number(r.total)).toBe(6); // el precio sale de la carta, no del cliente
    expect(await balance(ids.A1)).toBe(34);
    await expect(despachar({ comensal_id: ids.A1, kind: "kiosko", items: [{ menu_item_id: galleta, qty: 1 }] })).rejects.toThrow(/octógonos/);
    await expect(despachar({ comensal_id: ids.A1, kind: "kiosko", items: [{ menu_item_id: fruta, qty: 1 }] })).rejects.toThrow(/tope diario de S\/ 8.00: le quedan S\/ 2.00/);
    await expect(despachar({ kind: "kiosko", items: [{ menu_item_id: galleta, qty: 1 }], pago: "efectivo" })).rejects.toThrow(/octógonos/);
  });

  it("menú del día: reserva, raciones libres, una ración por día y forma de pago", async () => {
    await expect(despachar({ comensal_id: ids.A2, kind: "menu" })).rejects.toThrow(/no hay menú/);
    await db.query(`insert into comedor_menus (tenant_id, date, fondo, price, raciones) values ($1, app.lima_today(), 'Ají de gallina', 12, 3)`, [tenant]);
    await asCajero((q) => q(`select public.comedor_set_reserva($1, $2, $3, true)`, [tenant, ids.A3, today]));
    await asCajero((q) => q(`select public.comedor_set_reserva($1, $2, $3, true)`, [tenant, ids.D1, today]));

    const a2 = await despachar({ comensal_id: ids.A2, kind: "menu" }); // sin reserva: queda 1 ración libre
    expect([a2.pago, Number(a2.total)]).toEqual(["saldo", 12]);
    expect(await balance(ids.A2)).toBe(8);
    await expect(despachar({ comensal_id: ids.A2, kind: "menu" })).rejects.toThrow(/ya recibió/);
    await expect(despachar({ comensal_id: ids.A1, kind: "menu" })).rejects.toThrow(/raciones libres/); // las 2 restantes están reservadas
    await expect(despachar({ kind: "menu", pago: "efectivo" })).rejects.toThrow(/raciones libres/);

    expect((await despachar({ comensal_id: ids.A3, kind: "menu" })).pago).toBe("abono");
    expect((await despachar({ comensal_id: ids.D1, kind: "menu" })).pago).toBe("convenio");
    expect(await balance(ids.A3)).toBe(0);
    await expect(db.query(
      `insert into comedor_consumos (tenant_id, comensal_id, kind, total, pago, service_date) values ($1, $2, 'menu', 0, 'abono', app.lima_today())`,
      [tenant, ids.A3],
    )).rejects.toThrow(/una_racion/);
  });
});

describe("portal de familias", () => {
  it("el enlace muestra solo a sus hijos, con saldo y consumos", async () => {
    const r = await asUser(db, null, (q) => q<{ r: { tenant_name: string; yape: string; comensales: { name: string; balance: number; consumos: unknown[] }[] } }>(`select public.public_familia($1) r`, [token]));
    const data = r.rows[0].r;
    expect(data.tenant_name).toBe("Colegio San Martín");
    expect(data.yape).toBe("987654321");
    expect(data.comensales.map((c) => [c.name, Number(c.balance)])).toEqual([["Lucía", 34], ["Mateo", 8]]);
    expect(data.comensales[0].consumos.length).toBe(1);
    expect((await asUser(db, null, (q) => q<{ r: unknown }>(`select public.public_familia('x') r`))).rows[0].r).toBeNull();
  });

  it("reserva hasta la hora de cierre y no toca a comensales de otra familia", async () => {
    await db.query(`insert into comedor_menus (tenant_id, date, fondo, price, raciones) values ($1, app.lima_today() + 1, 'Seco', 12, 50)`, [tenant]);
    await asUser(db, null, (q) => q(`select public.public_familia_reservar($1, $2, $3, true)`, [token, ids.A1, tomorrow]));
    expect(Number((await one<{ n: string }>(`select count(*) n from comedor_reservas where comensal_id = $1 and by = 'familia'`, [ids.A1])).n)).toBe(1);
    await expect(asUser(db, null, (q) => q(`select public.public_familia_reservar($1, $2, $3, true)`, [token, ids.A1, yesterday]))).rejects.toThrow(/ya cerraron/);
    await expect(asUser(db, null, (q) => q(`select public.public_familia_reservar($1, $2, $3, true)`, [token, ids.A3, tomorrow]))).rejects.toThrow(/Enlace no válido/);
  });

  it("la familia fija el tope, bloquea categorías y anota alergias", async () => {
    await asUser(db, null, (q) => q(`select public.public_familia_ajustes($1, $2, 5, $3::uuid[], 'maní')`, [token, ids.A2, `{${catSnacks},00000000-0000-0000-0000-000000000000}`]));
    const c = await one<{ daily_limit: string; blocked: string[]; allergies: string }>(
      `select daily_limit, blocked_category_ids::text[] blocked, allergies from comensales where id = $1`, [ids.A2]);
    expect([Number(c.daily_limit), c.blocked, c.allergies]).toEqual([5, [catSnacks], "maní"]);
  });
});
