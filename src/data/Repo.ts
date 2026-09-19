import type {
  Category,
  MenuItem,
  ModifierExtra,
  ModifierPref,
  RestaurantTable,
  Order,
  KitchenTicket,
  DraftLine,
} from "./model";

export interface PayInput {
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

  // Floor
  getTables(): Promise<RestaurantTable[]>;

  // Orders
  getOpenOrderForTable(tableId: string): Promise<Order | null>;
  openOrder(tableId: string): Promise<Order>;
  addLine(orderId: string, line: DraftLine): Promise<void>;
  setLineQty(lineId: string, qty: number): Promise<void>;
  removeLine(lineId: string): Promise<void>;
  clearOrder(orderId: string): Promise<void>;
  sendToKitchen(orderId: string): Promise<void>;
  payOrder(input: PayInput): Promise<void>;

  // Kitchen
  getKitchenTickets(): Promise<KitchenTicket[]>;
  advanceTicket(ticketId: string): Promise<void>;

  /** Subscribe to changes (kitchen + orders + tables). Returns an unsubscribe fn. */
  subscribe(cb: () => void): () => void;
}
