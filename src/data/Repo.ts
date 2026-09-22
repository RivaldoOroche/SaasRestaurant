import type {
  Category,
  MenuItem,
  ModifierExtra,
  ModifierPref,
  RestaurantTable,
  Branch,
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
  OnlineOrder,
  PayExtras,
  Comprobante,
  EmitComprobanteInput,
  ResumenDiario,
  BajaResult,
  FiscalCredentialsInput,
  CardChargeInput,
  CardChargeResult,
} from "./model";

export interface PayInput extends PayExtras {
  orderId: string;
  method: string;
  total: number;
}

/**
 * Data access contract. Two implementations: MockRepo (in-browser, for demo /
 * offline UI work) and SupabaseRepo (real backend). The UI only ever talks to
 * this interface, so screens don't care which is active.
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
  getBranches(): Promise<Branch[]>;
  addBranch(name: string, city: string): Promise<void>;
  updateBranch(id: string, patch: Partial<{ name: string; city: string }>): Promise<void>;
  removeBranch(id: string): Promise<void>;

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
  getInventory(): Promise<InventoryItem[]>;
  adjustInventory(itemId: string, delta: number, actor: string): Promise<void>;
  /** Recetas: menú item id -> insumos consumidos por unidad. */
  getRecipes(): Promise<Record<string, { inventoryId: string; qtyPerUnit: number }[]>>;
  /** Define/reemplaza la receta de un platillo. */
  setRecipe(menuItemId: string, lines: { inventoryId: string; qtyPerUnit: number }[]): Promise<void>;

  // Menu changes (Carta)
  getMenuChanges(): Promise<MenuChange[]>;
  reviewChange(id: string, approve: boolean, actor: string): Promise<void>;

  // Online orders
  getOnlineOrders(): Promise<OnlineOrder[]>;

  // Fiscal (SUNAT)
  getComprobantes(): Promise<Comprobante[]>;
  emitComprobante(input: EmitComprobanteInput, online: boolean): Promise<Comprobante>;
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
  /** Guarda (sin devolver) la llave secreta de la pasarela de tarjeta. */
  setCardCredentials(provider: string, secretKey: string): Promise<void>;
  /** Guarda (sin devolver) las credenciales de facturación electrónica. */
  setFiscalCredentials(input: FiscalCredentialsInput): Promise<void>;
  /** Cobra con tarjeta usando el token del proveedor (cargo del lado del servidor). */
  chargeCard(input: CardChargeInput): Promise<CardChargeResult>;
  getActivityLog(): Promise<LogEntry[]>;

  /** Subscribe to changes (kitchen + orders + tables). Returns an unsubscribe fn. */
  subscribe(cb: () => void): () => void;
}
