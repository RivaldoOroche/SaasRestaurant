// Operaciones del POS: el "idioma" común entre el dispositivo y el servidor.
//
// Cada acción del salón (abrir mesa, agregar plato, cobrar…) se describe como
// una operación con id propio. El mismo objeto sirve para:
//   · aplicarla al instante en la pantalla (vista optimista),
//   · guardarla en la cola si no hay internet,
//   · enviarla al servidor (Supabase: RPC pos_apply; demo: MockRepo), que la
//     aplica una sola vez aunque llegue repetida.
// Los campos van en snake_case porque viajan tal cual al SQL (0032_pos_ops).
import type {
  CashSession,
  ComprobanteTipo,
  DeliveryChannel,
  DeliveryOrder,
  DeliveryPay,
  DeliveryStatus,
  KdsColumn,
  KitchenTicket,
  Order,
  RestaurantTable,
} from "../model";

export interface OpBase {
  id: string;
  /** Hora real en que ocurrió (ISO). Reportes y caja usan esta hora, no la de sincronización. */
  at: string;
  actor: string;
}

export interface DeliveryLineInput {
  line_id: string;
  item_id?: string | null;
  name: string;
  qty: number;
  price: number;
}

export type PosOpBody =
  | { type: "order.open"; order_id: string; table_id: string }
  | {
      type: "line.add";
      line_id: string;
      order_id: string;
      item_id: string | null;
      name: string;
      qty: number;
      unit_price: number;
      extra_price: number;
      modifiers: string;
    }
  | { type: "line.qty"; line_id: string; qty: number }
  | { type: "line.remove"; line_id: string }
  | { type: "line.void"; line_id: string; reason: string }
  | { type: "order.clear"; order_id: string }
  | { type: "order.send"; order_id: string; ticket_id: string; note?: string }
  | { type: "order.pay"; order_id: string; method: string; total: number; customer_id?: string | null; redeem?: number }
  | { type: "order.transfer"; order_id: string; to_table_id: string }
  | { type: "order.merge"; order_id: string; into_table_id: string }
  | { type: "ticket.advance"; ticket_id: string; from: KdsColumn }
  | {
      type: "delivery.create";
      order_id: string;
      channel: DeliveryChannel;
      customer_name: string;
      customer_phone: string;
      address: string;
      reference: string;
      zone_id: string | null;
      pay_method: DeliveryPay;
      cash_for: number | null;
      notes: string;
      branch_id: string | null;
      lines: DeliveryLineInput[];
    }
  | {
      type: "delivery.status";
      order_id: string;
      from: DeliveryStatus;
      to: DeliveryStatus;
      driver_id?: string | null;
      cancel_reason?: string;
      ticket_id?: string;
    }
  | { type: "inventory.adjust"; item_id: string; branch_id: string | null; delta: number; reason: string }
  | { type: "cash.open"; session_id: string; branch_id: string | null; opening_float: number }
  | { type: "cash.move"; session_id: string; movement_id: string; kind: "ingreso" | "egreso"; amount: number; reason: string }
  | {
      type: "cash.close";
      session_id: string;
      counted: Record<string, number>;
      notes: string;
      /** Estimación del equipo (el servidor recalcula el esperado con sus datos). */
      expected: Record<string, number>;
    }
  | {
      type: "cpe.emit";
      cpe_id: string;
      order_id: string | null;
      tipo: ComprobanteTipo;
      serie: string;
      /** Correlativo propuesto por la terminal; null = lo asigna el servidor. */
      number: number | null;
      buyer_ruc: string | null;
      buyer_name: string | null;
      subtotal: number;
      igv: number;
      total: number;
      reference: string;
    };

export type PosOp = OpBase & PosOpBody;
export type PosOpType = PosOp["type"];

/** Respuesta del servidor para una operación. */
export interface OpResult {
  id: string;
  status: "ok" | "error";
  dup?: boolean;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

/** Estado operativo que el dispositivo mantiene en memoria (y en disco). */
export interface PosState {
  tables: RestaurantTable[];
  /** Pedidos de salón/para llevar abiertos (y los recién cerrados hasta sincronizar). */
  orders: Order[];
  /** Comandas que siguen en cocina. */
  tickets: KitchenTicket[];
  /** Delivery activo y el terminado hoy. */
  deliveries: DeliveryOrder[];
  /** Turnos de caja abiertos (y los recién cerrados hasta sincronizar). */
  cash: CashSession[];
}

/** Estado devuelto por el servidor: completo o solo lo cambiado desde `since`. */
export interface PosSnapshot extends PosState {
  serverTime: string;
  full: boolean;
  /** En incremental: todos los ids de mesas, para detectar mesas eliminadas. */
  tableIds?: string[] | null;
}

export const emptyPosState = (): PosState => ({ tables: [], orders: [], tickets: [], deliveries: [], cash: [] });

export function uuid(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // Respaldo para contextos sin randomUUID (HTTP no seguro, navegadores antiguos).
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function makeOp(body: PosOpBody, actor = "POS"): PosOp {
  return { id: uuid(), at: new Date().toISOString(), actor, ...body } as PosOp;
}

/** Texto corto para mostrar una operación en el panel de sincronización. */
export function describeOp(op: PosOp): string {
  switch (op.type) {
    case "order.open":
      return "Abrir mesa";
    case "line.add":
      return `Agregar ${op.qty} × ${op.name}`;
    case "line.qty":
      return `Cambiar cantidad a ${op.qty}`;
    case "line.remove":
      return "Quitar plato";
    case "line.void":
      return `Anular plato (${op.reason})`;
    case "order.clear":
      return "Vaciar pedido";
    case "order.send":
      return "Enviar comanda a cocina";
    case "order.pay":
      return `Cobro S/ ${op.total.toFixed(2)} (${op.method})`;
    case "order.transfer":
      return "Transferir mesa";
    case "order.merge":
      return "Unir mesas";
    case "ticket.advance":
      return "Avanzar comanda";
    case "delivery.create":
      return `Nuevo delivery de ${op.customer_name}`;
    case "delivery.status":
      return `Delivery → ${op.to}`;
    case "inventory.adjust":
      return `Ajuste de inventario (${op.delta > 0 ? "+" : ""}${op.delta})`;
    case "cpe.emit":
      return `${op.tipo} por S/ ${op.total.toFixed(2)}`;
    case "cash.open":
      return `Abrir caja (fondo S/ ${op.opening_float.toFixed(2)})`;
    case "cash.move":
      return `${op.kind === "ingreso" ? "Ingreso" : "Egreso"} de caja S/ ${op.amount.toFixed(2)}`;
    case "cash.close":
      return "Cerrar caja";
  }
}
