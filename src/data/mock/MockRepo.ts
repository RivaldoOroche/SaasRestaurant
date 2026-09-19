import type { Repo, PayInput } from "../Repo";
import type {
  Order,
  OrderLine,
  KitchenTicket,
  RestaurantTable,
  DraftLine,
  KdsColumn,
  Customer,
  InventoryItem,
  LogEntry,
  BusinessSettings,
  MenuChange,
  MenuItem,
  Comprobante,
  EmitComprobanteInput,
} from "../model";
import { stubSunatGateway } from "../sunat/gateway";
import {
  CATEGORIES,
  MENU_ITEMS,
  EXTRAS,
  PREFS,
  RECIPES,
  seedTables,
  seedInventory,
  seedMenuChanges,
  seedOnlineOrders,
  CUSTOMERS,
  DEFAULT_SETTINGS,
} from "./seed";

interface MenuOverride {
  price?: number;
  available?: boolean;
}

interface MockState {
  tables: RestaurantTable[];
  orders: Order[];
  tickets: KitchenTicket[];
  customers: Customer[];
  inventory: InventoryItem[];
  log: LogEntry[];
  settings: BusinessSettings;
  changes: MenuChange[];
  menuOverrides: Record<string, MenuOverride>;
  comprobantes: Comprobante[];
}

const KEY = "nubepos-mock-v3";
const COL_ORDER: KdsColumn[] = ["nuevos", "preparacion", "listos", "entregado"];

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowTime(): string {
  return new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function loadState(): MockState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    /* ignore */
  }
  return {
    tables: seedTables(),
    orders: [],
    tickets: [],
    customers: CUSTOMERS.map((c) => ({ ...c })),
    inventory: seedInventory(),
    log: [],
    settings: { ...DEFAULT_SETTINGS },
    changes: seedMenuChanges(),
    menuOverrides: {},
    comprobantes: [],
  };
}

let folioSeq = 1;
function nextFolio(tipo: "Boleta" | "Factura"): string {
  const serie = tipo === "Factura" ? "F001" : "B001";
  return `${serie}-${String(1000 + folioSeq++).padStart(4, "0")}`;
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

  private pushLog(actor: string, message: string) {
    this.state.log.unshift({ id: uid("lg"), actor, message, at: nowTime() });
    this.state.log = this.state.log.slice(0, 60);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---- Menu ----
  async getCategories() {
    return [...CATEGORIES].sort((a, b) => a.sort - b.sort);
  }
  async getMenuItems(): Promise<MenuItem[]> {
    return MENU_ITEMS.map((it) => {
      const ov = this.state.menuOverrides[it.id];
      return ov ? { ...it, price: ov.price ?? it.price, available: ov.available ?? it.available } : { ...it };
    });
  }
  async getExtras() {
    return [...EXTRAS];
  }
  async getPrefs() {
    return [...PREFS];
  }
  async setMenuPrice(itemId: string, price: number) {
    this.state.menuOverrides[itemId] = { ...this.state.menuOverrides[itemId], price };
    this.pushLog("Editor", `Cambió precio de ${itemId} a S/ ${price}`);
    this.persist();
  }
  async setMenuAvailable(itemId: string, available: boolean) {
    this.state.menuOverrides[itemId] = { ...this.state.menuOverrides[itemId], available };
    const item = MENU_ITEMS.find((i) => i.id === itemId);
    this.pushLog("Editor", `${available ? "Reactivó" : "Marcó 86"} ${item?.name ?? itemId}`);
    this.persist();
  }

  async getTables() {
    return [...this.state.tables];
  }

  // ---- Orders ----
  private findOpenOrder(tableId: string): Order | undefined {
    return this.state.orders.find(
      (o) => o.tableId === tableId && o.status !== "cobrada" && o.status !== "anulada",
    );
  }

  async getOpenOrders() {
    return this.state.orders.filter((o) => o.status !== "cobrada" && o.status !== "anulada" && o.lines.length > 0);
  }

  async getPaidOrders() {
    return this.state.orders.filter((o) => o.status === "cobrada");
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

  async voidLine(lineId: string, reason: string, actor: string) {
    for (const o of this.state.orders) {
      const l = o.lines.find((x) => x.id === lineId);
      if (l) {
        o.lines = o.lines.filter((x) => x.id !== lineId);
        this.pushLog(actor, `Anuló ${l.name} · ${reason}`);
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

  async transferOrder(orderId: string, toTableId: string) {
    const order = this.order(orderId);
    const target = this.state.tables.find((t) => t.id === toTableId);
    if (!order || !target) return;
    const from = order.tableId;
    order.tableId = toTableId;
    order.tableLabel = String(target.number);
    order.zone = target.zone;
    order.seats = target.seats;
    target.status = "ocupada";
    if (from) {
      const src = this.state.tables.find((t) => t.id === from);
      if (src) src.status = "libre";
    }
    this.pushLog("Mesero", `Transfirió pedido a Mesa ${target.number}`);
    this.persist();
  }

  async mergeOrder(orderId: string, intoTableId: string) {
    const order = this.order(orderId);
    const targetOrder = this.findOpenOrder(intoTableId);
    if (!order || !targetOrder || order.id === targetOrder.id) return;
    targetOrder.lines.push(...order.lines.map((l) => ({ ...l, orderId: targetOrder.id })));
    order.lines = [];
    order.status = "anulada";
    if (order.tableId) {
      const src = this.state.tables.find((t) => t.id === order.tableId);
      if (src) src.status = "libre";
    }
    this.pushLog("Mesero", `Unió Mesa ${order.tableLabel} con Mesa ${targetOrder.tableLabel}`);
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
    this.pushLog("Mesero", `Envió comanda de Mesa ${order.tableLabel} a cocina`);
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

  /** Deducts recipe ingredients from inventory for an order's lines. */
  private deductInventory(order: Order) {
    const need = new Map<string, number>();
    for (const line of order.lines) {
      const recipe = line.itemId ? RECIPES[line.itemId] : undefined;
      if (!recipe) continue;
      for (const r of recipe) {
        need.set(r.inventoryId, (need.get(r.inventoryId) ?? 0) + r.qtyPerUnit * line.qty);
      }
    }
    for (const [invId, qty] of need) {
      const inv = this.state.inventory.find((i) => i.id === invId);
      if (inv) inv.stock = Math.max(0, Math.round((inv.stock - qty) * 1000) / 1000);
    }
    if (need.size > 0) this.pushLog("Sistema", `Descontó ${need.size} insumos del inventario`);
  }

  async payOrder({ orderId, method, total, customerId, redeem = 0 }: PayInput) {
    const order = this.order(orderId);
    if (!order) return;

    this.deductInventory(order);

    if (customerId) {
      const cust = this.state.customers.find((c) => c.id === customerId);
      if (cust) {
        const due = Math.max(0, total - redeem);
        const earned = Math.floor(due / 10);
        cust.points = cust.points - redeem + earned;
        cust.visits += 1;
        cust.spent = Math.round((cust.spent + due) * 100) / 100;
        if (redeem > 0) this.pushLog("Caja", `${cust.name} canjeó ${redeem} pts`);
      }
    }

    order.status = "cobrada";
    order.paidMethod = method;
    order.paidTotal = Math.max(0, total - redeem);
    if (order.tableId) {
      const table = this.state.tables.find((t) => t.id === order.tableId);
      if (table) table.status = "libre";
    }
    this.state.tickets = this.state.tickets.filter((t) => t.orderId !== orderId);
    this.pushLog("Caja", `Cobró Mesa ${order.tableLabel} · ${method} · S/ ${total.toFixed(2)}`);
    this.persist();
  }

  // ---- CRM ----
  async getCustomers() {
    return [...this.state.customers];
  }

  // ---- Inventory ----
  async getInventory() {
    return [...this.state.inventory];
  }
  async adjustInventory(itemId: string, delta: number, actor: string) {
    const inv = this.state.inventory.find((i) => i.id === itemId);
    if (!inv) return;
    inv.stock = Math.max(0, Math.round((inv.stock + delta) * 1000) / 1000);
    this.pushLog(actor, `Ajustó ${inv.name} (${delta > 0 ? "+" : ""}${delta} ${inv.unit})`);
    this.persist();
  }

  // ---- Menu changes ----
  async getMenuChanges() {
    return [...this.state.changes];
  }
  async reviewChange(id: string, approve: boolean, actor: string) {
    const ch = this.state.changes.find((c) => c.id === id);
    if (!ch) return;
    ch.status = approve ? "aprobado" : "rechazado";
    this.pushLog(actor, `${approve ? "Aprobó" : "Rechazó"} cambio: ${ch.itemName}`);
    this.persist();
  }

  // ---- Online ----
  async getOnlineOrders() {
    return seedOnlineOrders();
  }

  // ---- Fiscal (SUNAT) ----
  async getComprobantes() {
    return [...this.state.comprobantes].sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  }

  async emitComprobante(input: EmitComprobanteInput, online: boolean): Promise<Comprobante> {
    const cpe: Comprobante = {
      id: uid("cpe"),
      folio: nextFolio(input.tipo),
      tipo: input.tipo,
      buyerRuc: input.buyerRuc ?? null,
      buyerName: input.buyerName ?? null,
      subtotal: input.subtotal,
      igv: input.igv,
      total: input.total,
      reference: input.reference,
      status: online ? "enviando" : "encola",
      error: null,
      issuedAt: new Date().toISOString(),
    };
    this.state.comprobantes.unshift(cpe);
    if (online) {
      const res = await stubSunatGateway.submit(cpe);
      cpe.status = res.accepted ? "aceptada" : "rechazada";
      cpe.error = res.error ?? null;
    }
    this.pushLog("SUNAT", `${input.tipo} ${cpe.folio} · ${cpe.status}`);
    this.persist();
    return cpe;
  }

  async syncSunat(online: boolean): Promise<number> {
    if (!online) return 0;
    let sent = 0;
    for (const cpe of this.state.comprobantes) {
      if (cpe.status === "encola") {
        const res = await stubSunatGateway.submit(cpe);
        cpe.status = res.accepted ? "aceptada" : "rechazada";
        cpe.error = res.error ?? null;
        if (res.accepted) sent++;
      }
    }
    if (sent > 0) this.pushLog("SUNAT", `Sincronizó ${sent} comprobante(s)`);
    this.persist();
    return sent;
  }

  async retryComprobante(id: string, online: boolean): Promise<void> {
    if (!online) return;
    const cpe = this.state.comprobantes.find((c) => c.id === id);
    if (!cpe) return;
    const res = await stubSunatGateway.submit(cpe);
    cpe.status = res.accepted ? "aceptada" : "rechazada";
    cpe.error = res.error ?? null;
    this.pushLog("SUNAT", `Reintentó ${cpe.folio} · ${cpe.status}`);
    this.persist();
  }

  // ---- Settings + audit ----
  async getSettings() {
    return { ...this.state.settings };
  }
  async updateSettings(patch: Partial<BusinessSettings>) {
    this.state.settings = { ...this.state.settings, ...patch };
    this.pushLog("Ajustes", `Actualizó configuración del negocio`);
    this.persist();
  }
  async getActivityLog() {
    return [...this.state.log];
  }
}
