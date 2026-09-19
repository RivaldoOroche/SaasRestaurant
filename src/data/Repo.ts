import type {
  Category,
  MenuItem,
  ModifierExtra,
  ModifierPref,
  RestaurantTable,
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

  // Floor
  getTables(): Promise<RestaurantTable[]>;

  // Orders
  getOpenOrders(): Promise<Order[]>;
  getPaidOrders(): Promise<Order[]>;
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
  getKitchenTickets(): Promise<KitchenTicket[]>;
  advanceTicket(ticketId: string): Promise<void>;

  // CRM / loyalty
  getCustomers(): Promise<Customer[]>;

  // Inventory
  getInventory(): Promise<InventoryItem[]>;
  adjustInventory(itemId: string, delta: number, actor: string): Promise<void>;

  // Menu changes (Carta)
  getMenuChanges(): Promise<MenuChange[]>;
  reviewChange(id: string, approve: boolean, actor: string): Promise<void>;

  // Online orders
  getOnlineOrders(): Promise<OnlineOrder[]>;

  // Settings + audit
  getSettings(): Promise<BusinessSettings>;
  updateSettings(patch: Partial<BusinessSettings>): Promise<void>;
  getActivityLog(): Promise<LogEntry[]>;

  /** Subscribe to changes (kitchen + orders + tables). Returns an unsubscribe fn. */
  subscribe(cb: () => void): () => void;
}
