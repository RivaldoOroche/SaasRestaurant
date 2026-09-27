import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb, asUser, makeUser } from "./harness";
import { SyncEngine, type PosBackend } from "@/data/sync/engine";
import { MemoryKV } from "@/data/sync/kv";
import { makeOp, uuid } from "@/data/pos/ops";
import { mapSnapshot } from "@/data/supabase/SupabaseRepo";

// El motor de sincronización del dispositivo contra el SQL real (pos_apply /
// pos_snapshot en PGlite): la vista optimista local y lo que queda en la base
// deben coincidir, con y sin conexión.

const HIGUERA = "11111111-1111-1111-1111-111111111111";
let db: PGlite;
let mesero: string;

function backend(user: string): PosBackend {
  return {
    snapshot: (since) =>
      asUser(db, user, async (q) => {
        const { rows } = await q<{ s: Parameters<typeof mapSnapshot>[0] }>(`select pos_snapshot($1, null, $2) s`, [HIGUERA, since]);
        return mapSnapshot(rows[0].s);
      }),
    apply: (ops) =>
      asUser(db, user, async (q) => {
        const { rows } = await q<{ r: never }>(`select pos_apply($1, 'dev-sync-test', $2::jsonb) r`, [HIGUERA, JSON.stringify(ops)]);
        return rows[0].r;
      }),
  };
}

let online = true;
const engine = (user: string) =>
  new SyncEngine({
    backend: backend(user),
    kv: new MemoryKV(),
    key: `t-${Math.random()}`,
    isOnline: () => online,
    catalog: () => ({ zones: [], drivers: [] }),
  });

beforeAll(async () => {
  db = await createDb();
  mesero = await makeUser(db, "ana@lahiguera.pe", HIGUERA, "mesero");
}, 60_000);

describe("motor offline contra Postgres real", () => {
  it("la vista optimista coincide con lo que queda en la base tras sincronizar", async () => {
    const e = engine(mesero);
    await e.ready();
    const mesa = e.view().tables.find((t) => t.number === 9)!;
    const orderId = uuid();
    const lineId = uuid();

    online = false;
    await e.submit(makeOp({ type: "order.open", order_id: orderId, table_id: mesa.id }, "Ana"));
    await e.submit(
      makeOp({ type: "line.add", line_id: lineId, order_id: orderId, item_id: null, name: "Pisco sour", qty: 2, unit_price: 26, extra_price: 0, modifiers: "" }, "Ana"),
    );
    await e.submit(makeOp({ type: "order.send", order_id: orderId, ticket_id: uuid() }, "Ana"));
    await e.submit(makeOp({ type: "line.qty", line_id: lineId, qty: 3 }, "Ana"));
    const local = structuredClone(e.view());
    expect(e.getStatus().pending).toBe(4);

    online = true;
    await e.flush();
    expect(e.getStatus().pending).toBe(0);
    expect(e.getStatus().rejected).toEqual([]);

    // Tras sincronizar, la vista sale de la base: debe ser igual a la optimista.
    const synced = e.view();
    const pick = (s: typeof local) => {
      const o = s.orders.find((x) => x.id === orderId)!;
      return {
        status: o.status,
        lines: o.lines.map((l) => ({ id: l.id, qty: l.qty, sentQty: l.sentQty })),
        table: s.tables.find((t) => t.id === mesa.id)!.status,
        tickets: s.tickets.filter((k) => k.orderId === orderId).map((k) => k.lines),
      };
    };
    expect(pick(synced)).toEqual(pick(local));
    expect(pick(synced)).toEqual({
      status: "en_cocina",
      lines: [{ id: lineId, qty: 3, sentQty: 2 }],
      table: "ocupada",
      tickets: [[{ qty: 2, name: "Pisco sour" }]],
    });
  });

  it("cobrar sin conexión: la venta queda con la hora real en que ocurrió", async () => {
    const e = engine(mesero);
    await e.ready();
    const mesa = e.view().tables.find((t) => t.number === 10)!;
    const orderId = uuid();
    online = false;
    await e.submit(makeOp({ type: "order.open", order_id: orderId, table_id: mesa.id }));
    await e.submit(makeOp({ type: "line.add", line_id: uuid(), order_id: orderId, item_id: null, name: "Chicha", qty: 1, unit_price: 14, extra_price: 0, modifiers: "" }));
    const pay = makeOp({ type: "order.pay", order_id: orderId, method: "efectivo", total: 14 });
    pay.at = new Date(Date.now() - 20 * 60_000).toISOString(); // cobrada hace 20 min, sin red
    await e.submit(pay);
    online = true;
    await e.flush();
    const { rows } = await db.query<{ closed_at: Date; status: string }>(`select closed_at, status from orders where id = $1`, [orderId]);
    expect(rows[0].status).toBe("cobrada");
    expect(Math.abs(rows[0].closed_at.getTime() - Date.parse(pay.at))).toBeLessThan(1000);
    expect(e.view().orders.some((o) => o.id === orderId)).toBe(false); // sale del estado operativo
  });
});
