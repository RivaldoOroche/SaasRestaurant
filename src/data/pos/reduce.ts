// Reglas de las operaciones del POS en TypeScript. Espejo de app.pos_exec
// (supabase/migrations/0032_pos_ops.sql); las pruebas de reduce.test.ts fijan
// el mismo comportamiento que pos_ops.db.test.ts verifica en Postgres.
//
// Se usa para:
//   · la vista optimista: estado del servidor + operaciones aún no confirmadas,
//   · el "servidor" del modo demo (MockRepo).
// Aplica sobre un borrador mutable: cada caso valida TODO antes de modificar,
// así una operación rechazada no deja el estado a medias.
import type { DeliveryDriver, DeliveryOrder, DeliveryZone, KdsColumn, KitchenTicket, Order } from "../model";
import { deliveryTotals, isAggregator, kitchenLabel, transitionPatch } from "@/lib/delivery";
import type { PosOp, PosState } from "./ops";

/** Rechazo de negocio (el servidor respondería lo mismo). */
export class OpError extends Error {}

export interface ReduceCtx {
  zones: DeliveryZone[];
  drivers: DeliveryDriver[];
  /** Pedidos redirigidos (abierto sin conexión en una mesa ya abierta → pedido existente). */
  aliases: Map<string, string>;
  /** Código visible y token de seguimiento de un delivery nuevo (el servidor los genera). */
  deliveryIds?: () => { code: string; trackingToken: string };
}

const OPEN = (o: Order) => o.status !== "cobrada" && o.status !== "anulada";
const COLS: KdsColumn[] = ["nuevos", "preparacion", "listos", "entregado"];
const round2 = (n: number) => Math.round(n * 100) / 100;

export const orderLabel = (o: Pick<Order, "tableId" | "tableLabel">) => (o.tableId ? `Mesa ${o.tableLabel}` : "Para llevar");

function resolve(ctx: ReduceCtx, id: string): string {
  return ctx.aliases.get(id) ?? id;
}

function openOrder(s: PosState, ctx: ReduceCtx, id: string): Order {
  const o = s.orders.find((x) => x.id === resolve(ctx, id));
  if (!o) throw new OpError("El pedido ya no existe.");
  if (!OPEN(o)) throw new OpError(`El pedido ya fue ${o.status === "cobrada" ? "cobrado" : "anulado"} en otro dispositivo.`);
  return o;
}

function freeTable(s: PosState, tableId: string | null) {
  if (!tableId) return;
  if (s.orders.some((o) => o.tableId === tableId && OPEN(o))) return;
  const t = s.tables.find((x) => x.id === tableId);
  if (t) t.status = "libre";
}

function sendKitchen(
  s: PosState,
  o: { id: string; branchId?: string | null },
  label: string,
  lines: { qty: number; name: string }[],
  ticketId: string,
  note: string,
  at: string,
) {
  if (s.tickets.some((k) => k.id === ticketId)) return 0;
  if (lines.length === 0) return 0;
  const ticket: KitchenTicket = {
    id: ticketId,
    orderId: o.id,
    tableLabel: label,
    col: "nuevos",
    enteredAt: Date.parse(at) || Date.now(),
    note,
    done: false,
    lines,
    branchId: o.branchId ?? null,
  };
  s.tickets.push(ticket);
  return lines.length;
}

/**
 * Aplica una operación. Devuelve el mismo `result` que daría el servidor.
 * Lanza OpError si la operación no procede.
 */
export function applyOp(s: PosState, op: PosOp, ctx: ReduceCtx): Record<string, unknown> {
  switch (op.type) {
    case "order.open": {
      const t = s.tables.find((x) => x.id === op.table_id);
      if (!t) throw new OpError("La mesa ya no existe.");
      if (s.orders.some((o) => o.id === op.order_id)) return { order_id: op.order_id };
      const other = s.orders.find((o) => o.tableId === t.id && OPEN(o));
      if (other) {
        ctx.aliases.set(op.order_id, other.id);
        return { order_id: other.id, redirected: true };
      }
      s.orders.push({
        id: op.order_id,
        tableId: t.id,
        tableLabel: String(t.number),
        seats: t.seats,
        zone: t.zone,
        kind: "mesa",
        status: "abierta",
        openedAt: op.at,
        lines: [],
        branchId: t.branchId ?? null,
      });
      t.status = "ocupada";
      return { order_id: op.order_id };
    }

    case "line.add": {
      const o = openOrder(s, ctx, op.order_id);
      if (!o.lines.some((l) => l.id === op.line_id)) {
        o.lines.push({
          id: op.line_id,
          orderId: o.id,
          itemId: op.item_id,
          name: op.name,
          qty: Math.max(1, op.qty),
          unitPrice: op.unit_price,
          extraPrice: op.extra_price ?? 0,
          modifiers: op.modifiers ?? "",
          splitPayer: null,
          sentQty: 0,
        });
      }
      return { order_id: o.id };
    }

    case "line.qty":
    case "line.remove":
    case "line.void": {
      const o = s.orders.find((x) => x.lines.some((l) => l.id === op.line_id));
      if (!o) return { skipped: "line_gone" };
      if (!OPEN(o)) openOrder(s, ctx, o.id); // lanza el error legible
      const qty = op.type === "line.qty" ? op.qty : 0;
      if (qty > 0) {
        const l = o.lines.find((x) => x.id === op.line_id)!;
        l.qty = qty;
        l.sentQty = Math.min(l.sentQty ?? 0, qty);
      } else {
        o.lines = o.lines.filter((x) => x.id !== op.line_id);
      }
      return {};
    }

    case "order.clear": {
      const o = openOrder(s, ctx, op.order_id);
      o.lines = o.lines.filter((l) => (l.sentQty ?? 0) > 0);
      return {};
    }

    case "order.send": {
      const o = openOrder(s, ctx, op.order_id);
      const pending = o.lines.filter((l) => l.qty > (l.sentQty ?? 0));
      const n = sendKitchen(
        s,
        o,
        orderLabel(o),
        pending.map((l) => ({ qty: l.qty - (l.sentQty ?? 0), name: l.modifiers ? `${l.name} · ${l.modifiers}` : l.name })),
        op.ticket_id,
        op.note ?? "",
        op.at,
      );
      if (n > 0) {
        for (const l of pending) l.sentQty = l.qty;
        if (o.status === "abierta") o.status = "en_cocina";
      }
      return { lines: n };
    }

    case "order.pay": {
      const o = openOrder(s, ctx, op.order_id);
      o.status = "cobrada";
      o.closedAt = op.at;
      o.paidMethod = op.method;
      o.paidTotal = round2(Math.max(0, op.total - (op.redeem ?? 0)));
      if (op.customer_id) o.customerId = op.customer_id;
      freeTable(s, o.tableId);
      return { paid_total: o.paidTotal };
    }

    case "order.transfer": {
      const o = openOrder(s, ctx, op.order_id);
      const t = s.tables.find((x) => x.id === op.to_table_id);
      if (!t) throw new OpError("La mesa destino ya no existe.");
      if ((t.branchId ?? null) !== (o.branchId ?? null)) {
        throw new OpError("Solo se puede transferir a una mesa de la misma sucursal.");
      }
      if (s.orders.some((x) => x.tableId === t.id && OPEN(x) && x.id !== o.id)) {
        throw new OpError(`La Mesa ${t.number} ya tiene un pedido; usa «Unir».`);
      }
      const from = o.tableId;
      o.tableId = t.id;
      o.tableLabel = String(t.number);
      o.zone = t.zone;
      o.seats = t.seats;
      t.status = "ocupada";
      freeTable(s, from);
      return {};
    }

    case "order.merge": {
      const o = openOrder(s, ctx, op.order_id);
      const target = s.orders.find((x) => x.tableId === op.into_table_id && OPEN(x) && x.id !== o.id);
      if (!target) throw new OpError("La mesa destino no tiene un pedido abierto.");
      target.lines.push(...o.lines.map((l) => ({ ...l, orderId: target.id })));
      for (const k of s.tickets) if (k.orderId === o.id) k.orderId = target.id;
      o.lines = [];
      o.status = "anulada";
      o.closedAt = op.at;
      ctx.aliases.set(o.id, target.id);
      freeTable(s, o.tableId);
      return { order_id: target.id };
    }

    case "ticket.advance": {
      const k = s.tickets.find((x) => x.id === op.ticket_id);
      if (!k || k.col !== op.from) return { skipped: "already_moved" };
      const next = COLS[Math.min(COLS.indexOf(k.col) + 1, COLS.length - 1)];
      k.col = next;
      k.enteredAt = Date.parse(op.at) || Date.now();
      k.done = next === "listos" || next === "entregado";
      if (next === "entregado") s.tickets = s.tickets.filter((x) => x.id !== k.id);
      return {};
    }

    case "delivery.create": {
      const existing = s.deliveries.find((d) => d.id === op.order_id);
      if (existing) return { code: existing.code, tracking_token: existing.trackingToken };
      if (op.lines.length === 0) throw new OpError("Agrega al menos un plato.");
      if (!op.customer_name.trim()) throw new OpError("Falta el nombre del cliente.");
      const aggregator = isAggregator(op.channel);
      const zone = aggregator ? undefined : ctx.zones.find((z) => z.id === op.zone_id && z.active);
      if (!aggregator) {
        if (!op.address.trim()) throw new OpError("Falta la dirección de entrega.");
        if (!zone) throw new OpError("Elige una zona de reparto activa.");
      }
      const items = op.lines.map((l) => ({ name: l.name, qty: Math.max(1, l.qty), price: l.price }));
      const ids = ctx.deliveryIds?.() ?? { code: "D-···", trackingToken: "" };
      const d: DeliveryOrder = {
        id: op.order_id,
        code: ids.code,
        trackingToken: ids.trackingToken,
        channel: op.channel,
        customerName: op.customer_name.trim(),
        customerPhone: op.customer_phone ?? "",
        address: op.address.trim(),
        reference: op.reference ?? "",
        zoneId: zone?.id ?? null,
        zoneName: zone?.name ?? "",
        items,
        ...deliveryTotals(items, zone?.fee ?? 0),
        payMethod: aggregator ? op.pay_method ?? "pagado_app" : op.pay_method,
        cashFor: op.pay_method === "efectivo" ? op.cash_for : null,
        status: "recibido",
        driverId: null,
        driverName: null,
        notes: op.notes ?? "",
        cancelReason: null,
        etaMin: zone?.etaMin ?? 30,
        branchId: op.branch_id,
        createdAt: op.at,
        acceptedAt: null,
        readyAt: null,
        dispatchedAt: null,
        deliveredAt: null,
        cancelledAt: null,
      };
      s.deliveries.unshift(d);
      return { code: d.code, tracking_token: d.trackingToken };
    }

    case "delivery.status": {
      const d = s.deliveries.find((x) => x.id === op.order_id);
      if (!d) throw new OpError("El pedido de delivery ya no existe.");
      if (d.status === op.to) return { skipped: "same_status" };
      if (d.status !== op.from) throw new OpError(`Otro usuario ya movió ${d.code} a «${d.status}».`);
      let patch: Partial<DeliveryOrder>;
      try {
        patch = transitionPatch(d, op.to, { driverId: op.driver_id, cancelReason: op.cancel_reason }, op.at);
      } catch (e) {
        throw new OpError((e as Error).message);
      }
      if (op.to === "en_camino" && patch.driverId && !isAggregator(d.channel)) {
        const drv = ctx.drivers.find((x) => x.id === patch.driverId);
        if (!drv?.active) throw new OpError("Ese repartidor no está disponible.");
        patch.driverName = drv.name;
      }
      Object.assign(d, patch);
      if (op.to === "preparando" && op.ticket_id) {
        sendKitchen(s, d, kitchenLabel(d.code), d.items.map((i) => ({ qty: i.qty, name: i.name })), op.ticket_id, d.notes, op.at);
      }
      if (op.to === "cancelado") s.tickets = s.tickets.filter((k) => k.orderId !== d.id);
      return {};
    }

    // No cambian el estado operativo (inventario y comprobantes se consultan aparte).
    case "inventory.adjust":
    case "cpe.emit":
      return {};
  }
}
