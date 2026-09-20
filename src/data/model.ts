import type { TableStatus, OrderStatus, KdsColumn } from "@/types/database";

export type { TableStatus, OrderStatus, KdsColumn };

export interface Category {
  id: string;
  key: string;
  name: string;
  icon: string;
  subtitle: string;
  sort: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  emoji: string;
  badge: string | null;
  veg: boolean;
  spicy: boolean;
  gf: boolean;
  meat: boolean;
  available: boolean;
  sort: number;
}

export interface ModifierExtra {
  id: string;
  key: string;
  name: string;
  price: number;
}

export interface ModifierPref {
  id: string;
  key: string;
  name: string;
}

export interface RestaurantTable {
  id: string;
  zone: string;
  number: number;
  seats: number;
  status: TableStatus;
  waiterId: string | null;
}

export interface OrderLine {
  id: string;
  orderId: string;
  itemId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  extraPrice: number;
  modifiers: string;
  splitPayer: number | null;
}

export interface Order {
  id: string;
  tableId: string | null;
  tableLabel: string;
  seats: number;
  zone: string;
  status: OrderStatus;
  openedAt: string;
  lines: OrderLine[];
  paidMethod?: string | null;
  paidTotal?: number | null;
}

export interface TicketLine {
  qty: number;
  name: string;
}

export interface KitchenTicket {
  id: string;
  orderId: string | null;
  tableLabel: string;
  col: KdsColumn;
  /** epoch ms when the ticket entered its current column (drives the timer) */
  enteredAt: number;
  note: string;
  done: boolean;
  lines: TicketLine[];
}

/** A line being built in the cart before it's persisted to an order. */
export interface DraftLine {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  extraPrice: number;
  modifiers: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  visits: number;
  spent: number;
  points: number;
  tier: string;
}

export type InventoryStatus = "ok" | "bajo" | "agotado";

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  stock: number;
  par: number;
  cost?: number; // costo por unidad (para food cost)
}

/** Recipe: for a menu item, how much of each inventory item it consumes per unit. */
export interface RecipeLine {
  inventoryId: string;
  qtyPerUnit: number;
}

export interface LogEntry {
  id: string;
  actor: string;
  message: string;
  at: string;
}

export type CardProvider = "ninguno" | "culqi" | "izipay" | "niubiz";

export interface BusinessSettings {
  name: string;
  currency: import("@/lib/money").Currency;
  taxRate: number; // percent, e.g. 18
  tipPresets: number[];
  onlineOrders: boolean;
  autoTip: boolean;
  yapeNumber?: string;
  plinNumber?: string;
  cardProvider?: CardProvider;
  cardPublicKey?: string; // clave pública/publicable (no secreta)
}

export type MenuChangeStatus = "pendiente" | "aprobado" | "rechazado";

export interface MenuChange {
  id: string;
  kind: string;
  itemName: string;
  detail: string;
  status: MenuChangeStatus;
}

export interface OnlineOrder {
  id: string;
  channel: string;
  name: string;
  items: string;
  total: number;
  eta: string;
  status: string;
}

/** Payment options passed into payOrder (loyalty, discount, tip). */
export interface PayExtras {
  customerId?: string | null;
  redeem?: number;
  discountPct?: number;
  tipPct?: number;
}

export type ComprobanteTipo = "Boleta" | "Factura" | "NotaCredito";
export type SunatStatus = "encola" | "enviando" | "aceptada" | "rechazada";

export interface Comprobante {
  id: string;
  folio: string;
  tipo: ComprobanteTipo;
  buyerRuc: string | null;
  buyerName: string | null;
  subtotal: number;
  igv: number;
  total: number;
  reference: string;
  status: SunatStatus;
  error: string | null;
  issuedAt: string;
  refFolio?: string | null; // folio del comprobante que modifica (para NC)
  motivo?: string | null; // motivo de la nota de crédito
}

/** Resultado del envío de un resumen diario de boletas a SUNAT. */
export interface ResumenDiario {
  folio: string; // p.ej. RC-20260920-1
  fecha: string; // YYYY-MM-DD
  count: number; // boletas incluidas
  total: number; // importe total resumido
  status: SunatStatus;
}

export interface EmitComprobanteInput {
  orderId?: string | null;
  tipo: ComprobanteTipo;
  buyerRuc?: string | null;
  buyerName?: string | null;
  subtotal: number;
  igv: number;
  total: number;
  reference: string;
}
