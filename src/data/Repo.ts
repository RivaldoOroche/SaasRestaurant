import type {
  Category,
  MenuItem,
  ModifierExtra,
  ModifierPref,
  RestaurantTable,
  Branch,
  BranchQuota,
  BranchSales,
  StaffMember,
  StaffRole,
  Order,
  KitchenTicket,
  DraftLine,
  Customer,
  InventoryItem,
  LogEntry,
  BusinessSettings,
  MenuChange,
  PayExtras,
  Comprobante,
  EmitComprobanteInput,
  ResumenDiario,
  BajaResult,
  FiscalCredentialsInput,
  CardCredentialsInput,
  CardChargeInput,
  CardChargeResult,
  Complaint,
  Reservation,
  WaitlistEntry,
  Subscription,
  MyPlanRequest,
  DeliveryZone,
  DeliveryDriver,
  DeliveryOrder,
  DeliveryStatus,
  NewDeliveryInput,
} from "./model";
import type { PosBackend, SyncStatus } from "./sync/engine";

/** Datos para crear/editar una sucursal (nodo del árbol). */
export interface BranchInput {
  name: string;
  city: string;
  /** Padre en el árbol; por defecto, la sede principal. */
  parentId?: string | null;
  address?: string;
  phone?: string;
}

/** Caja/terminal del dispositivo: serie SUNAT propia para numerar sin conexión. */
export interface TerminalInfo {
  serieBoleta: string;
  serieFactura: string;
  lastBoleta: number;
  lastFactura: number;
}

export interface PayInput extends PayExtras {
  orderId: string;
  method: string;
  total: number;
}

/**
 * Contrato de datos que usa la UI. Lo arma `createRepo` (sync/PosService):
 * operaciones del salón offline-first sobre un backend (MockRepo en el modo
 * demo, SupabaseRepo en producción). Las pantallas no saben cuál está activo.
 */
export interface Repo {
  // Menu
  getCategories(): Promise<Category[]>;
  getMenuItems(): Promise<MenuItem[]>;
  getExtras(): Promise<ModifierExtra[]>;
  getPrefs(): Promise<ModifierPref[]>;
  setMenuPrice(itemId: string, price: number): Promise<void>;
  setMenuAvailable(itemId: string, available: boolean): Promise<void>;

  // Sucursales
  /** Árbol completo: la sede principal (parentId null) y sus sucursales, activas o no. */
  getBranches(): Promise<Branch[]>;
  addBranch(input: BranchInput): Promise<void>;
  updateBranch(id: string, patch: Partial<BranchInput & { active: boolean }>): Promise<void>;
  removeBranch(id: string): Promise<void>;
  /** Cuánto del límite de sucursales del plan está en uso. */
  getBranchQuota(): Promise<BranchQuota>;

  // Personal (staff_members)
  getStaff(): Promise<StaffMember[]>;
  addStaff(input: { name: string; role: StaffRole; pin: string }): Promise<void>;
  updateStaff(id: string, patch: Partial<{ name: string; role: StaffRole; active: boolean }>): Promise<void>;
  setStaffPin(id: string, pin: string): Promise<void>;

  // Floor
  getTables(branchId?: string | null): Promise<RestaurantTable[]>;
  /** Configuración de mesas (gerencia). `count` agrega varias mesas de una zona. */
  addTable(input: { zone: string; number: number; seats: number; branchId: string | null; count?: number }): Promise<void>;
  updateTable(id: string, patch: Partial<{ zone: string; number: number; seats: number }>): Promise<void>;
  removeTable(id: string): Promise<void>;

  // Orders
  getOpenOrders(branchId?: string | null): Promise<Order[]>;
  getPaidOrders(branchId?: string | null): Promise<Order[]>;
  getOpenOrderForTable(tableId: string): Promise<Order | null>;
  openOrder(tableId: string): Promise<Order>;
  addLine(orderId: string, line: DraftLine): Promise<void>;
  setLineQty(lineId: string, qty: number): Promise<void>;
  removeLine(lineId: string): Promise<void>;
  voidLine(lineId: string, reason: string, actor: string): Promise<void>;
  clearOrder(orderId: string): Promise<void>;
  transferOrder(orderId: string, toTableId: string): Promise<void>;
  mergeOrder(orderId: string, intoTableId: string): Promise<void>;
  sendToKitchen(orderId: string): Promise<void>;
  payOrder(input: PayInput): Promise<void>;

  // Kitchen
  getKitchenTickets(branchId?: string | null): Promise<KitchenTicket[]>;
  advanceTicket(ticketId: string): Promise<void>;

  // Sucursales — ventas agregadas (comparativa del dueño)
  getBranchSales(): Promise<BranchSales[]>;

  // CRM / loyalty
  getCustomers(): Promise<Customer[]>;

  // Inventory
  /** Stock de una sucursal (o la suma de todas con null). */
  getInventory(branchId?: string | null): Promise<InventoryItem[]>;
  adjustInventory(itemId: string, delta: number, actor: string, branchId?: string | null): Promise<void>;
  /** Recetas: menú item id -> insumos consumidos por unidad. */
  getRecipes(): Promise<Record<string, { inventoryId: string; qtyPerUnit: number }[]>>;
  /** Define/reemplaza la receta de un platillo. */
  setRecipe(menuItemId: string, lines: { inventoryId: string; qtyPerUnit: number }[]): Promise<void>;

  // Menu changes (Carta)
  getMenuChanges(): Promise<MenuChange[]>;
  reviewChange(id: string, approve: boolean, actor: string): Promise<void>;

  // Fiscal (SUNAT)
  /** Lista liviana (sin XML ni CDR). */
  getComprobantes(): Promise<Comprobante[]>;
  /** XML firmado y CDR de un comprobante (se piden al abrir el detalle). */
  getComprobanteDocs(id: string): Promise<{ signedXml: string | null; cdr: string | null }>;
  /** Con o sin conexión: numera con la serie de la caja y envía a SUNAT cuando hay red. */
  emitComprobante(input: EmitComprobanteInput, online?: boolean): Promise<Comprobante>;
  /** Emite una nota de crédito que anula un comprobante ya emitido. */
  emitNotaCredito(originalId: string, motivo: string, online: boolean): Promise<Comprobante>;
  syncSunat(online: boolean): Promise<number>;
  retryComprobante(id: string, online: boolean): Promise<void>;
  /** Envía a SUNAT el resumen diario de las boletas del día. */
  sendResumenDiario(online: boolean): Promise<ResumenDiario>;
  /** Comunica a SUNAT la baja de un comprobante (factura) ya emitido. */
  comunicarBaja(comprobanteId: string, motivo: string, online: boolean): Promise<BajaResult>;

  // Settings + audit
  getSettings(): Promise<BusinessSettings>;
  updateSettings(patch: Partial<BusinessSettings>): Promise<void>;
  /** Guarda (sin devolver) las credenciales secretas de la pasarela de tarjeta. */
  setCardCredentials(input: CardCredentialsInput): Promise<void>;
  /** Guarda (sin devolver) las credenciales de facturación electrónica. */
  setFiscalCredentials(input: FiscalCredentialsInput): Promise<void>;
  /** Cobra con tarjeta usando el token del proveedor (cargo del lado del servidor). */
  chargeCard(input: CardChargeInput): Promise<CardChargeResult>;

  // Libro de Reclamaciones
  /** Hojas del Libro de Reclamaciones del tenant. */
  getComplaints(): Promise<Complaint[]>;
  /** Responde una hoja de reclamación (marca respondida). */
  respondComplaint(id: string, response: string): Promise<void>;

  // Reservas y lista de espera
  getReservations(): Promise<Reservation[]>;
  addReservation(input: Omit<Reservation, "id" | "status">): Promise<void>;
  updateReservation(id: string, patch: Partial<Reservation>): Promise<void>;
  removeReservation(id: string): Promise<void>;
  getWaitlist(): Promise<WaitlistEntry[]>;
  addWaitlist(input: Omit<WaitlistEntry, "id" | "status" | "createdAt">): Promise<void>;
  updateWaitlist(id: string, patch: Partial<WaitlistEntry>): Promise<void>;
  removeWaitlist(id: string): Promise<void>;

  // Suscripción (autoservicio del tenant)
  getSubscription(): Promise<Subscription>;
  getMyPlanRequest(): Promise<MyPlanRequest | null>;
  requestPlanChange(toPlan: string): Promise<void>;

  // Permisos por rol (overrides del tenant sobre los permisos por defecto)
  /** Devuelve los overrides por rol: { admin: [...screens], mesero: [...] }. */
  getRolePermissions(): Promise<Record<string, string[]>>;
  setRolePermissions(role: string, screens: string[]): Promise<void>;
  getActivityLog(): Promise<LogEntry[]>;

  // Delivery
  getDeliveryZones(): Promise<DeliveryZone[]>;
  /** Crea (sin id) o actualiza una zona de reparto. Solo gerencia. */
  saveDeliveryZone(zone: Omit<DeliveryZone, "id"> & { id?: string }): Promise<void>;
  removeDeliveryZone(id: string): Promise<void>;
  getDrivers(): Promise<DeliveryDriver[]>;
  saveDriver(driver: Omit<DeliveryDriver, "id"> & { id?: string }): Promise<void>;
  removeDriver(id: string): Promise<void>;
  /** Pedidos activos + los terminados de hoy (más recientes primero). */
  getDeliveryOrders(): Promise<DeliveryOrder[]>;
  createDeliveryOrder(input: NewDeliveryInput): Promise<DeliveryOrder>;
  /** Avanza/cancela un pedido aplicando las reglas de lib/delivery. Al aceptarlo
   *  (→ preparando) envía la comanda al KDS; al cancelarlo la retira. */
  setDeliveryStatus(
    id: string,
    to: DeliveryStatus,
    opts?: { driverId?: string | null; cancelReason?: string },
  ): Promise<void>;

  // Notificaciones push (Web Push)
  /** Guarda la suscripción push del navegador del usuario actual. */
  savePushSubscription(data: { endpoint: string; p256dh: string; auth: string }): Promise<void>;
  /** Elimina una suscripción push por su endpoint. */
  removePushSubscription(endpoint: string): Promise<void>;

  /**
   * Avisa cambios: "view" = cambió el estado operativo local (mesas, pedidos,
   * cocina, delivery); "synced" = el servidor confirmó cambios (refrescar
   * reportes, caja, inventario, comprobantes). Devuelve la función para salir.
   */
  subscribe(cb: (reason: "view" | "synced") => void): () => void;

  // Sincronización offline
  syncStatus(): SyncStatus;
  onSyncStatus(cb: () => void): () => void;
  /** Descarta operaciones rechazadas por el servidor (ya revisadas). */
  dismissRejected(opId?: string): void;
  /** Fuerza el envío de la cola y una lectura del servidor. */
  syncNow(): Promise<void>;
}

/**
 * Métodos operativos: los implementa PosService sobre el motor de
 * sincronización (funcionan sin conexión), no cada backend.
 */
export type PosMethod =
  | "getTables"
  | "getOpenOrders"
  | "getOpenOrderForTable"
  | "openOrder"
  | "addLine"
  | "setLineQty"
  | "removeLine"
  | "voidLine"
  | "clearOrder"
  | "transferOrder"
  | "mergeOrder"
  | "sendToKitchen"
  | "payOrder"
  | "getKitchenTickets"
  | "advanceTicket"
  | "getDeliveryOrders"
  | "createDeliveryOrder"
  | "setDeliveryStatus"
  | "adjustInventory"
  | "emitComprobante"
  | "subscribe"
  | "syncStatus"
  | "onSyncStatus"
  | "dismissRejected"
  | "syncNow";

/** Lo que aporta cada backend (demo o Supabase): datos administrativos + operaciones. */
export interface BackendRepo extends Omit<Repo, PosMethod>, PosBackend {
  terminal(deviceId: string): Promise<TerminalInfo>;
  /** Cambios hechos por otros dispositivos (Realtime). */
  onRemoteChange(cb: () => void): () => void;
  /** true si las lecturas deben guardarse para abrir la app sin conexión. */
  readonly remote: boolean;
}
