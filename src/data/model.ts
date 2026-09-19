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
