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

export interface Branch {
  id: string;
  name: string;
  city: string;
}

export type StaffRole = "dueno" | "admin" | "mesero";

export interface StaffMember {
  id: string;
  name: string;
  initials: string;
  role: StaffRole;
  active: boolean;
}

export interface RestaurantTable {
  id: string;
  zone: string;
  number: number;
  seats: number;
  status: TableStatus;
  waiterId: string | null;
  branchId?: string | null;
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
  branchId?: string | null;
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
  branchId?: string | null;
}

/** Ventas agregadas por sucursal (comparativa del dueño). */
export interface BranchSales {
  branchId: string;
  name: string;
  city: string;
  sales: number;
  orders: number;
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

/** Proveedor de facturación electrónica del tenant. */
export type BillingProvider = "ninguno" | "sunat_directo" | "nubefact" | "bizlinks" | "efact";
export type SunatMode = "beta" | "produccion";

export interface BusinessSettings {
  name: string;
  slug?: string; // identificador público del tenant (para carta / libro de reclamaciones)
  currency: import("@/lib/money").Currency;
  taxRate: number; // percent, e.g. 18
  tipPresets: number[];
  onlineOrders: boolean;
  autoTip: boolean;
  yapeNumber?: string;
  plinNumber?: string;
  cardProvider?: CardProvider;
  cardPublicKey?: string; // clave pública/publicable (no secreta)
  // --- Datos del emisor (empresa del tenant) ---
  ruc?: string; // RUC de 11 dígitos del emisor
  razonSocial?: string;
  direccionFiscal?: string;
  ubigeo?: string; // 6 dígitos (ubicación SUNAT)
  // --- Facturación electrónica ---
  billingProvider?: BillingProvider;
  sunatMode?: SunatMode; // beta (homologación) o producción
  solUser?: string; // usuario SOL (SUNAT directo) — no secreto
  billingEndpoint?: string; // URL del OSE/PSE (no secreto)
}

/** Datos de una tarjeta para tokenizar (nunca se envían a nuestro backend). */
export interface CardInput {
  number: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  email: string;
}

/** Cargo con tarjeta: se envía el token (no la tarjeta) a la Edge Function. */
export interface CardChargeInput {
  token: string;
  amount: number; // en la moneda del negocio (no céntimos)
  currency: string;
  email: string;
  description?: string;
}
export interface CardChargeResult {
  success: boolean;
  chargeId?: string;
  error?: string;
}

/** Credenciales secretas de facturación (se escriben, nunca se leen del cliente). */
export interface FiscalCredentialsInput {
  provider: BillingProvider;
  solPass?: string; // clave SOL (SUNAT directo)
  certPem?: string; // certificado X.509 en PEM
  keyPem?: string; // llave privada PKCS#8 en PEM
  apiToken?: string; // token/API key del OSE/PSE
}

/** Credenciales de la pasarela de tarjeta (secretas: solo escritura). */
export interface CardCredentialsInput {
  provider: CardProvider;
  secretKey?: string; // llave secreta (Culqi) / password de API (Izipay) / token (Niubiz)
  merchantId?: string; // código de comercio (Niubiz) / código de tienda (Izipay)
  webhookSecret?: string; // secreto para verificar la firma de los webhooks
}

/** Hoja del Libro de Reclamaciones (Indecopi). */
export interface Complaint {
  id: string;
  correlativo: number;
  consumerName: string;
  consumerDoc: string;
  consumerDocType: string;
  consumerEmail?: string;
  consumerPhone?: string;
  itemType: string; // producto | servicio
  itemAmount?: number;
  itemDescription?: string;
  claimType: string; // reclamo | queja
  detail: string;
  request?: string;
  status: string; // pendiente | respondido
  response?: string;
  respondedAt?: string;
  createdAt: string;
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
  signedXml?: string | null; // XML UBL firmado
  cdr?: string | null; // CDR de SUNAT (base64 del ZIP)
}

/** Resultado del envío de un resumen diario de boletas a SUNAT. */
export interface ResumenDiario {
  folio: string; // p.ej. RC-20260920-1
  fecha: string; // YYYY-MM-DD
  count: number; // boletas incluidas
  total: number; // importe total resumido
  status: SunatStatus;
  ticket?: string | null; // ticket de SUNAT (envío asíncrono)
}

/** Resultado de una comunicación de baja (RA) a SUNAT. */
export interface BajaResult {
  folio: string; // p.ej. RA-20260920-1
  refFolio: string; // comprobante dado de baja
  status: SunatStatus;
  ticket?: string | null;
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
