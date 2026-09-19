import type { Repo, PayInput } from "../Repo";
import type { Order, OrderLine, KitchenTicket, RestaurantTable, DraftLine, KdsColumn } from "../model";
import { CATEGORIES, MENU_ITEMS, EXTRAS, PREFS, seedTables } from "./seed";

interface MockState {
  tables: RestaurantTable[];
  orders: Order[];
  tickets: KitchenTicket[];
}

const KEY = "nubepos-mock-v1";
const COL_ORDER: KdsColumn[] = ["nuevos", "preparacion", "listos", "entregado"];

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadState(): MockState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    /* ignore */
  }
  return { tables: seedTables(), orders: [], tickets: [] };
}

/** In-browser repo used for demo / offline UI work. */
export class MockRepo implements Repo {
  private state: MockState = loadState();
  private listeners = new Set<() => void>();

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
    this.listeners.forEach((l) => l());
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async getCategories() {
    return [...CATEGORIES].sort((a, b) => a.sort - b.sort);
  }
  async getMenuItems() {
    return [...MENU_ITEMS];
  }
  async getExtras() {
    return [...EXTRAS];
  }
  async getPrefs() {
    return [...PREFS];
  }
  async getTables() {
    return [...this.state.tables];
  }

  private findOpenOrder(tableId: string): Order | undefined {
    return this.state.orders.find(
      (o) => o.tableId === tableId && o.status !== "cobrada" && o.status !== "anulada",
    );
  }

  async getOpenOrderForTable(tableId: string) {
    return this.findOpenOrder(tableId) ?? null;
  }

  async openOrder(tableId: string): Promise<Order> {
    const existing = this.findOpenOrder(tableId);
    if (existing) return existing;
    const table = this.state.tables.find((t) => t.id === tableId);
    const order: Order = {
      id: uid("o"),
      tableId,
      tableLabel: table ? String(table.number) : "—",
      seats: table?.seats ?? 2,
      zone: table?.zone ?? "",
      status: "abierta",
      openedAt: new Date().toISOString(),
      lines: [],
    };
    this.state.orders.push(order);
    if (table) table.status = "ocupada";
    this.persist();
    return order;
  }

  private order(orderId: string): Order | undefined {
    return this.state.orders.find((o) => o.id === orderId);
  }

  async addLine(orderId: string, line: DraftLine) {
    const order = this.order(orderId);
    if (!order) return;
    const newLine: OrderLine = {
      id: uid("l"),
      orderId,
      itemId: line.itemId,
      name: line.name,
      qty: line.qty,
      unitPrice: line.unitPrice,
      extraPrice: line.extraPrice,
      modifiers: line.modifiers,
      splitPayer: null,
    };
    order.lines.push(newLine);
    this.persist();
  }

  async setLineQty(lineId: string, qty: number) {
    for (const o of this.state.orders) {
      const l = o.lines.find((x) => x.id === lineId);
      if (l) {
        if (qty <= 0) o.lines = o.lines.filter((x) => x.id !== lineId);
        else l.qty = qty;
        this.persist();
        return;
      }
    }
  }

  async removeLine(lineId: string) {
    for (const o of this.state.orders) {
      const before = o.lines.length;
      o.lines = o.lines.filter((x) => x.id !== lineId);
      if (o.lines.length !== before) {
        this.persist();
        return;
      }
    }
  }

  async clearOrder(orderId: string) {
    const order = this.order(orderId);
    if (!order) return;
    order.lines = [];
    this.persist();
  }

  async sendToKitchen(orderId: string) {
    const order = this.order(orderId);
    if (!order || order.lines.length === 0) return;
    const ticket: KitchenTicket = {
      id: uid("k"),
      orderId,
      tableLabel: `Mesa ${order.tableLabel}`,
      col: "nuevos",
      enteredAt: Date.now(),
      note: "",
      done: false,
      lines: order.lines.map((l) => ({ qty: l.qty, name: l.name })),
    };
    this.state.tickets.push(ticket);
    order.status = "en_cocina";
    this.persist();
  }

  async getKitchenTickets() {
    return this.state.tickets.filter((t) => t.col !== "entregado");
  }

  async advanceTicket(ticketId: string) {
    const t = this.state.tickets.find((x) => x.id === ticketId);
    if (!t) return;
    const idx = COL_ORDER.indexOf(t.col);
    const next = COL_ORDER[Math.min(idx + 1, COL_ORDER.length - 1)];
    t.col = next;
    t.enteredAt = Date.now();
    t.done = next === "listos" || next === "entregado";
    if (next === "entregado") {
      this.state.tickets = this.state.tickets.filter((x) => x.id !== ticketId);
    }
    this.persist();
  }

  async payOrder({ orderId }: PayInput) {
    const order = this.order(orderId);
    if (!order) return;
    order.status = "cobrada";
    if (order.tableId) {
      const table = this.state.tables.find((t) => t.id === order.tableId);
      if (table) table.status = "libre";
    }
    // Remove any lingering kitchen tickets for this order.
    this.state.tickets = this.state.tickets.filter((t) => t.orderId !== orderId);
    this.persist();
  }
}
