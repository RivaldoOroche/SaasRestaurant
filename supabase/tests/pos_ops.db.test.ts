import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { createDb, asUser, makeUser } from "./harness";

// Operaciones del POS (pos_apply / pos_snapshot / pos_terminal) en Postgres real:
// atomicidad, idempotencia (reintentos offline), conflictos entre dispositivos.

const HIGUERA = "11111111-1111-1111-1111-111111111111";
const MUELLE = "a0000000-0000-0000-0000-000000000002";
const SAN_ISIDRO = "22222222-0000-0000-0000-000000000002";

let db: PGlite;
let mesero: string;
let dueno: string;
let rival: string;

type Result = { id: string; status: "ok" | "error"; dup?: boolean; result?: Record<string, unknown>; error?: string };
type Op = Record<string, unknown> & { type: string };

const op = (o: Op) => ({ id: randomUUID(), at: new Date().toISOString(), actor: "Ana", ...o });

async function apply(user: string, ops: ReturnType<typeof op>[], tenant = HIGUERA): Promise<Result[]> {
  return asUser(db, user, async (q) => {
    const { rows } = await q<{ r: Result[] }>(`select pos_apply($1, 'dev-test-1', $2::jsonb) r`, [
      tenant,
      JSON.stringify(ops),
    ]);
    return rows[0].r;
  });
}

async function tableId(number: number, branch?: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `select id from restaurant_tables where tenant_id = $1 and number = $2 and ($3::uuid is null or branch_id = $3)`,
    [HIGUERA, number, branch ?? null],
  );
  return rows[0].id;
}

async function menuItem(name: string): Promise<{ id: string; price: number }> {
  const { rows } = await db.query<{ id: string; price: string }>(`select id, price from menu_items where name = $1`, [name]);
  return { id: rows[0].id, price: Number(rows[0].price) };
}

const stock = async (branch: string, insumo: string) =>
  Number(
    (
      await db.query<{ qty: string }>(
        `select s.qty from inventory_stock s join inventory_items i on i.id = s.item_id
         where s.branch_id = $1 and i.name = $2`,
        [branch, insumo],
      )
    ).rows[0].qty,
  );

beforeAll(async () => {
  db = await createDb();
  mesero = await makeUser(db, "ana@lahiguera.pe", HIGUERA, "mesero");
  dueno = await makeUser(db, "monica@lahiguera.pe", HIGUERA, "dueno");
  rival = await makeUser(db, "andres@muelle.pe", MUELLE, "dueno");
}, 60_000);

describe("pedido de mesa de punta a punta", () => {
  it("abrir → agregar → enviar solo lo nuevo → cobrar, con inventario de SU sucursal", async () => {
    const mesa = await tableId(14); // San Isidro
    const ceviche = await menuItem("Ceviche clásico");
    const orderId = randomUUID();
    const line1 = randomUUID();
    const before = await stock(SAN_ISIDRO, "Pescado fresco");

    const r1 = await apply(mesero, [
      op({ type: "order.open", order_id: orderId, table_id: mesa }),
      op({ type: "line.add", line_id: line1, order_id: orderId, item_id: ceviche.id, name: "Ceviche clásico", qty: 2, unit_price: ceviche.price }),
      op({ type: "order.send", order_id: orderId, ticket_id: randomUUID() }),
      // Segunda ronda: solo el plato nuevo va a cocina.
      op({ type: "line.qty", line_id: line1, qty: 3 }),
      op({ type: "order.send", order_id: orderId, ticket_id: randomUUID() }),
    ]);
    expect(r1.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);

    const tickets = await db.query<{ qty: number }>(
      `select tl.qty from kitchen_tickets k join ticket_lines tl on tl.ticket_id = k.id
       where k.order_id = $1 order by k.entered_at, tl.qty desc`,
      [orderId],
    );
    expect(tickets.rows.map((r) => r.qty)).toEqual([2, 1]);

    const pay = op({ type: "order.pay", order_id: orderId, method: "yape", total: 126 });
    expect((await apply(mesero, [pay]))[0].status).toBe("ok");

    const o = await db.query<{ status: string; paid_total: string; branch_id: string }>(
      `select status, paid_total, branch_id from orders where id = $1`,
      [orderId],
    );
    expect(o.rows[0]).toMatchObject({ status: "cobrada", branch_id: SAN_ISIDRO });
    expect(Number(o.rows[0].paid_total)).toBe(126);
    expect(await stock(SAN_ISIDRO, "Pescado fresco")).toBeCloseTo(before - 0.75, 3);
    const t = await db.query<{ status: string }>(`select status from restaurant_tables where id = $1`, [mesa]);
    expect(t.rows[0].status).toBe("libre");

    // Reenvío del mismo cobro (p. ej. la red cayó antes de la respuesta): no duplica.
    const again = await apply(mesero, [pay]);
    expect(again[0]).toMatchObject({ status: "ok", dup: true });
    expect(await stock(SAN_ISIDRO, "Pescado fresco")).toBeCloseTo(before - 0.75, 3);
  });

  it("cobrar un pedido ya cobrado en otro dispositivo es un error legible", async () => {
    const mesa = await tableId(3);
    const orderId = randomUUID();
    await apply(mesero, [
      op({ type: "order.open", order_id: orderId, table_id: mesa }),
      op({ type: "line.add", line_id: randomUUID(), order_id: orderId, name: "Pisco sour", qty: 1, unit_price: 26 }),
      op({ type: "order.pay", order_id: orderId, method: "efectivo", total: 26 }),
    ]);
    const r = await apply(dueno, [op({ type: "order.pay", order_id: orderId, method: "tarjeta", total: 26 })]);
    expect(r[0].status).toBe("error");
    expect(r[0].error).toMatch(/ya fue cobrado en otro dispositivo/);
  });

  it("dos dispositivos abren la misma mesa sin conexión: los pedidos se unen", async () => {
    const mesa = await tableId(5);
    const a = randomUUID();
    const b = randomUUID();
    await apply(mesero, [
      op({ type: "order.open", order_id: a, table_id: mesa }),
      op({ type: "line.add", line_id: randomUUID(), order_id: a, name: "Causa limeña", qty: 1, unit_price: 28 }),
    ]);
    const rb = await apply(dueno, [
      op({ type: "order.open", order_id: b, table_id: mesa }),
      op({ type: "line.add", line_id: randomUUID(), order_id: b, name: "Chicha morada", qty: 2, unit_price: 14 }),
    ]);
    expect(rb[0].result).toMatchObject({ order_id: a, redirected: true });
    const lines = await db.query<{ name: string }>(`select name from order_lines where order_id = $1 order by name`, [a]);
    expect(lines.rows.map((l) => l.name)).toEqual(["Causa limeña", "Chicha morada"]);
  });

  it("un lote con una operación inválida aplica las demás (cada una es atómica)", async () => {
    const mesa = await tableId(6);
    const orderId = randomUUID();
    const r = await apply(mesero, [
      op({ type: "order.open", order_id: orderId, table_id: mesa }),
      op({ type: "line.add", line_id: randomUUID(), order_id: orderId, name: "X", qty: 1, unit_price: "no-es-numero" }),
      op({ type: "line.add", line_id: randomUUID(), order_id: orderId, name: "Anticuchos", qty: 1, unit_price: 34 }),
    ]);
    expect(r.map((x) => x.status)).toEqual(["ok", "error", "ok"]);
    const n = await db.query<{ n: number }>(`select count(*)::int n from order_lines where order_id = $1`, [orderId]);
    expect(n.rows[0].n).toBe(1);
  });

  it("no se puede operar sobre otro restaurante", async () => {
    await expect(apply(rival, [op({ type: "order.open", order_id: randomUUID(), table_id: await tableId(7) })])).rejects.toThrow(
      /Sin acceso/,
    );
    // Aun con acceso a su propio tenant, la mesa ajena no existe para él.
    const r = await apply(rival, [op({ type: "order.open", order_id: randomUUID(), table_id: await tableId(7) })], MUELLE);
    expect(r[0].error).toMatch(/La mesa ya no existe/);
  });
});

describe("delivery unificado con pedidos", () => {
  it("el delivery entregado cuenta como venta (reportes/caja) con su costo de envío", async () => {
    const zone = await db.query<{ id: string }>(
      `insert into delivery_zones (tenant_id, name, fee, eta_min) values ($1, 'Miraflores', 5, 35) returning id`,
      [HIGUERA],
    );
    const driver = await db.query<{ id: string }>(
      `insert into delivery_drivers (tenant_id, name, phone, vehicle) values ($1, 'José', '987111222', 'moto') returning id`,
      [HIGUERA],
    );
    const id = randomUUID();
    const created = await apply(mesero, [
      op({
        type: "delivery.create", order_id: id, channel: "whatsapp", customer_name: "Rosa", customer_phone: "987654321",
        address: "Av. Larco 345", zone_id: zone.rows[0].id, pay_method: "efectivo", cash_for: 100,
        lines: [{ name: "Lomo saltado", qty: 2, price: 42 }],
      }),
    ]);
    expect(created[0].result).toMatchObject({ code: expect.stringMatching(/^D-/) });

    const steps = await apply(mesero, [
      op({ type: "delivery.status", order_id: id, from: "recibido", to: "preparando", ticket_id: randomUUID() }),
      op({ type: "delivery.status", order_id: id, from: "preparando", to: "listo" }),
      op({ type: "delivery.status", order_id: id, from: "listo", to: "en_camino" }),
    ]);
    expect(steps.map((s) => s.status)).toEqual(["ok", "ok", "error"]); // falta repartidor
    expect(steps[2].error).toMatch(/Asigna un repartidor/);

    await apply(mesero, [
      op({ type: "delivery.status", order_id: id, from: "listo", to: "en_camino", driver_id: driver.rows[0].id }),
      op({ type: "delivery.status", order_id: id, from: "en_camino", to: "entregado" }),
    ]);

    const o = await db.query<{ status: string; paid_total: string; paid_method: string; kind: string }>(
      `select status, paid_total, paid_method, kind from orders where id = $1`,
      [id],
    );
    expect(o.rows[0]).toMatchObject({ status: "cobrada", paid_method: "efectivo", kind: "delivery" });
    expect(Number(o.rows[0].paid_total)).toBe(89);

    const v = await asUser(db, mesero, (q) =>
      q<{ total: string; items: unknown[]; driver_name: string }>(`select total, items, driver_name from v_delivery_orders where id = $1`, [id]),
    );
    expect(Number(v.rows[0].total)).toBe(89);
    expect(v.rows[0].driver_name).toBe("José");

    const tok = await db.query<{ tracking_token: string }>(`select tracking_token from delivery_orders where id = $1`, [id]);
    const pub = await asUser(db, null, (q) =>
      q<{ s: { status: string } }>(`select public_delivery_status($1) s`, [tok.rows[0].tracking_token]),
    );
    expect(pub.rows[0].s.status).toBe("entregado");
  });

  it("cancelar retira la comanda de cocina y anula el pedido", async () => {
    const id = randomUUID();
    await apply(mesero, [
      op({ type: "delivery.create", order_id: id, channel: "rappi", customer_name: "Rappi 88213", lines: [{ name: "Ají de gallina", qty: 1, price: 38 }] }),
      op({ type: "delivery.status", order_id: id, from: "recibido", to: "preparando", ticket_id: randomUUID() }),
      op({ type: "delivery.status", order_id: id, from: "preparando", to: "cancelado", cancel_reason: "Cliente canceló" }),
    ]);
    const k = await db.query<{ col: string }>(`select col from kitchen_tickets where order_id = $1`, [id]);
    expect(k.rows.map((r) => r.col)).toEqual(["entregado"]);
    const o = await db.query<{ status: string }>(`select status from orders where id = $1`, [id]);
    expect(o.rows[0].status).toBe("anulada");
  });
});

describe("sincronización y terminales", () => {
  it("pos_snapshot entrega el estado completo y luego solo lo cambiado", async () => {
    const full = await asUser(db, mesero, (q) =>
      q<{ s: { server_time: string; tables: unknown[]; orders: { id: string }[] } }>(`select pos_snapshot($1) s`, [HIGUERA]),
    );
    expect(full.rows[0].s.tables.length).toBe(20);
    const since = full.rows[0].s.server_time;

    const orderId = randomUUID();
    await apply(mesero, [
      op({ type: "order.open", order_id: orderId, table_id: await tableId(8) }),
      op({ type: "line.add", line_id: randomUUID(), order_id: orderId, name: "Pisco sour", qty: 1, unit_price: 26 }),
    ]);
    const delta = await asUser(db, mesero, (q) =>
      q<{ s: { tables: { number: number }[]; orders: { id: string; lines: unknown[] }[]; table_ids: string[] } }>(
        `select pos_snapshot($1, null, $2) s`,
        [HIGUERA, since],
      ),
    );
    expect(delta.rows[0].s.orders.map((o) => o.id)).toEqual([orderId]);
    expect(delta.rows[0].s.orders[0].lines).toHaveLength(1);
    expect(delta.rows[0].s.tables.map((t) => t.number)).toEqual([8]);
    expect(delta.rows[0].s.table_ids).toHaveLength(20);
  });

  it("cada caja tiene su serie y numera sin conexión; un folio repetido se renumera", async () => {
    const t1 = await asUser(db, mesero, (q) =>
      q<{ t: { serie_boleta: string; last_boleta: number } }>(`select pos_terminal($1, 'device-aaaa-1', null, 'Caja 1') t`, [HIGUERA]),
    );
    const t2 = await asUser(db, dueno, (q) =>
      q<{ t: { serie_boleta: string } }>(`select pos_terminal($1, 'device-bbbb-2') t`, [HIGUERA]),
    );
    expect(t1.rows[0].t.serie_boleta).toBe("B001");
    expect(t2.rows[0].t.serie_boleta).toBe("B002");

    const next = t1.rows[0].t.last_boleta + 1;
    const emit = (number: number) =>
      op({ type: "cpe.emit", cpe_id: randomUUID(), tipo: "Boleta", serie: "B001", number, subtotal: 10, igv: 1.8, total: 11.8, reference: "Mesa 1" });
    const [a] = await apply(mesero, [emit(next)]);
    expect(a.result).toMatchObject({ folio: `B001-${next}`, status: "encola" });
    const [b] = await apply(mesero, [emit(next)]); // mismo número desde otro origen
    expect(b.result?.folio).toBe(`B001-${next + 1}`);
    const q = await db.query<{ n: number }>(`select count(*)::int n from sunat_outbox`);
    expect(q.rows[0].n).toBe(2);
  });

  it("folios de más de 4 dígitos no se truncan", async () => {
    await db.query(`insert into folio_counters (tenant_id, serie, last) values ($1, 'B099', 99999)`, [HIGUERA]);
    const r = await asUser(db, mesero, (q) => q<{ f: string }>(`select next_folio($1, 'B099') f`, [HIGUERA]));
    expect(r.rows[0].f).toBe("B099-100000");
  });

  it("solo gerencia ajusta inventario, y queda en el kardex de la sucursal", async () => {
    const item = await db.query<{ id: string }>(`select id from inventory_items where name = 'Limón'`);
    const adj = (u: string) => apply(u, [op({ type: "inventory.adjust", item_id: item.rows[0].id, branch_id: SAN_ISIDRO, delta: 5, reason: "compra" })]);
    expect((await adj(mesero))[0].error).toMatch(/Solo gerencia/);
    const before = await stock(SAN_ISIDRO, "Limón");
    expect((await adj(dueno))[0].status).toBe("ok");
    expect(await stock(SAN_ISIDRO, "Limón")).toBeCloseTo(before + 5, 3);
  });

  it("caja: fondo + ventas en efectivo + movimientos = esperado; el cierre calcula la diferencia", async () => {
    const MIRA = "22222222-0000-0000-0000-000000000001";
    const session = randomUUID();
    const r = await apply(mesero, [op({ type: "cash.open", session_id: session, branch_id: MIRA, opening_float: 200 })]);
    expect(r[0].status).toBe("ok");
    // Una segunda caja abierta en la misma sucursal se rechaza.
    const dup = await apply(mesero, [op({ type: "cash.open", session_id: randomUUID(), branch_id: MIRA, opening_float: 0 })]);
    expect(dup[0].error).toMatch(/Ya hay una caja abierta/);

    const orderId = randomUUID();
    await apply(mesero, [
      op({ type: "order.open", order_id: orderId, table_id: await tableId(11) }),
      op({ type: "line.add", line_id: randomUUID(), order_id: orderId, name: "Lomo", qty: 1, unit_price: 48 }),
      op({ type: "order.pay", order_id: orderId, method: "efectivo", total: 48 }),
      op({ type: "cash.move", session_id: session, movement_id: randomUUID(), kind: "egreso", amount: 30, reason: "Hielo" }),
    ]);
    const [closed] = await apply(mesero, [
      op({ type: "cash.close", session_id: session, counted: { efectivo: 215 }, notes: "", expected: { efectivo: 0 } }),
    ]);
    // El servidor ignora el esperado del equipo: 200 + 48 - 30 = 218; contado 215 → falta 3.
    expect(closed.result).toMatchObject({ expected: { efectivo: 218 }, difference: -3 });
    const row = await db.query<{ status: string }>(`select status from cash_sessions where id = $1`, [session]);
    expect(row.rows[0].status).toBe("cerrada");
  });
});
