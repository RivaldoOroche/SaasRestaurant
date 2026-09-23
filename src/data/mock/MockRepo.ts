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
  RecipeLine,
  Comprobante,
  EmitComprobanteInput,
  ResumenDiario,
  BajaResult,
  FiscalCredentialsInput,
  CardCredentialsInput,
  CardChargeInput,
  CardChargeResult,
} from "../model";
import { stubSunatGateway } from "../sunat/gateway";
import type { Branch, BranchSales, StaffMember, StaffRole } from "../model";
import {
  CATEGORIES,
  MENU_ITEMS,
  EXTRAS,
  PREFS,
  RECIPES,
  BRANCHES,
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

interface MockStaff extends StaffMember {
  pin?: string; // solo demo (local)
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
  branches: Branch[];
  staff: MockStaff[];
  recipes: Record<string, RecipeLine[]>;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function seedStaff(): MockStaff[] {
  return [
    { id: uid("st"), name: "Mónica R.", initials: "MR", role: "dueno", active: true, pin: "1111" },
    { id: uid("st"), name: "Iker Solís", initials: "IS", role: "admin", active: true, pin: "2222" },
    { id: uid("st"), name: "Ana Ruiz", initials: "AR", role: "mesero", active: true, pin: "3333" },
    { id: uid("st"), name: "Carlos Vega", initials: "CV", role: "mesero", active: true, pin: "4444" },
  ];
}

const KEY = "nubepos-mock-v4";
const COL_ORDER: KdsColumn[] = ["nuevos", "preparacion", "listos", "entregado"];

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowTime(): string {
  return new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

/** Demo: adjunta un XML firmado y un CDR de muestra al aceptar un comprobante. */
function demoArtifacts(cpe: Comprobante): void {
  cpe.signedXml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- Representación demo del XML UBL firmado (en producción lo genera y firma la Edge Function) -->\n` +
    `<Documento folio="${cpe.folio}" tipo="${cpe.tipo}" total="${cpe.total.toFixed(2)}" emitido="${cpe.issuedAt}"/>`;
  cpe.cdr = btoa(`CDR demo | ${cpe.folio} | ACEPTADO POR SUNAT (beta) | ${cpe.issuedAt}`);
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
    branches: BRANCHES.map((b) => ({ ...b })),
    staff: seedStaff(),
    recipes: JSON.parse(JSON.stringify(RECIPES)) as Record<string, RecipeLine[]>,
  };
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

  async getBranches(): Promise<Branch[]> {
    return this.state.branches.map((b) => ({ ...b }));
  }

  async addBranch(name: string, city: string) {
    this.state.branches.push({ id: uid("br"), name, city });
    this.pushLog("Dueño", `Creó sucursal ${name}`);
    this.persist();
  }
  async updateBranch(id: string, patch: Partial<{ name: string; city: string }>) {
    const b = this.state.branches.find((x) => x.id === id);
    if (!b) return;
    Object.assign(b, patch);
    this.pushLog("Dueño", `Editó sucursal ${b.name}`);
    this.persist();
  }
  async removeBranch(id: string) {
    if (this.state.tables.some((t) => t.branchId === id)) {
      throw new Error("La sucursal tiene mesas; elimínalas o muévelas primero");
    }
    const b = this.state.branches.find((x) => x.id === id);
    this.state.branches = this.state.branches.filter((x) => x.id !== id);
    if (b) this.pushLog("Dueño", `Eliminó sucursal ${b.name}`);
    this.persist();
  }

  // ---- Personal ----
  async getStaff(): Promise<StaffMember[]> {
    return this.state.staff.map(({ pin: _pin, ...s }) => {
      void _pin;
      return { ...s };
    });
  }
  async addStaff(input: { name: string; role: StaffRole; pin: string }) {
    this.state.staff.push({
      id: uid("st"),
      name: input.name,
      initials: initialsOf(input.name),
      role: input.role,
      active: true,
      pin: input.pin,
    });
    this.pushLog("Dueño", `Agregó a ${input.name} (${input.role})`);
    this.persist();
  }
  async updateStaff(id: string, patch: Partial<{ name: string; role: StaffRole; active: boolean }>) {
    const s = this.state.staff.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    if (patch.name) s.initials = initialsOf(patch.name);
    this.pushLog("Dueño", `Actualizó a ${s.name}`);
    this.persist();
  }
  async setStaffPin(id: string, pin: string) {
    const s = this.state.staff.find((x) => x.id === id);
    if (!s) return;
    s.pin = pin;
    this.pushLog("Dueño", `Cambió el PIN de ${s.name}`);
    this.persist();
  }

  async getTables(branchId?: string | null) {
    const all = [...this.state.tables];
    return branchId ? all.filter((t) => t.branchId === branchId) : all;
  }

  async addTable(input: { zone: string; number: number; seats: number; branchId: string | null; count?: number }) {
    const count = Math.max(1, input.count ?? 1);
    for (let i = 0; i < count; i++) {
      this.state.tables.push({
        id: uid("t"),
        zone: input.zone,
        number: input.number + i,
        seats: input.seats,
        status: "libre",
        waiterId: null,
        branchId: input.branchId,
      });
    }
    this.pushLog("Gerencia", `Agregó ${count} mesa(s) en ${input.zone}`);
    this.persist();
  }

  async updateTable(id: string, patch: Partial<{ zone: string; number: number; seats: number }>) {
    const t = this.state.tables.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    this.pushLog("Gerencia", `Editó Mesa ${t.number}`);
    this.persist();
  }

  async removeTable(id: string) {
    const t = this.state.tables.find((x) => x.id === id);
    if (!t) return;
    if (t.status !== "libre") throw new Error("No se puede eliminar una mesa ocupada");
    this.state.tables = this.state.tables.filter((x) => x.id !== id);
    this.pushLog("Gerencia", `Eliminó Mesa ${t.number}`);
    this.persist();
  }

  // ---- Orders ----
  private findOpenOrder(tableId: string): Order | undefined {
    return this.state.orders.find(
      (o) => o.tableId === tableId && o.status !== "cobrada" && o.status !== "anulada",
    );
  }

  async getOpenOrders(branchId?: string | null) {
    return this.state.orders.filter(
      (o) =>
        o.status !== "cobrada" &&
        o.status !== "anulada" &&
        o.lines.length > 0 &&
        (!branchId || o.branchId === branchId),
    );
  }

  async getPaidOrders(branchId?: string | null) {
    return this.state.orders.filter((o) => o.status === "cobrada" && (!branchId || o.branchId === branchId));
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
      branchId: table?.branchId ?? null,
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
      branchId: order.branchId ?? null,
    };
    this.state.tickets.push(ticket);
    order.status = "en_cocina";
    this.pushLog("Mesero", `Envió comanda de Mesa ${order.tableLabel} a cocina`);
    this.persist();
  }

  async getKitchenTickets(branchId?: string | null) {
    return this.state.tickets.filter((t) => t.col !== "entregado" && (!branchId || t.branchId === branchId));
  }

  async getBranchSales(): Promise<BranchSales[]> {
    return this.state.branches.map((b) => {
      const paid = this.state.orders.filter((o) => o.status === "cobrada" && o.branchId === b.id);
      const sales = Math.round(paid.reduce((s, o) => s + (o.paidTotal ?? 0), 0) * 100) / 100;
      return { branchId: b.id, name: b.name, city: b.city, sales, orders: paid.length };
    });
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
      const recipe = line.itemId ? this.state.recipes[line.itemId] : undefined;
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
  async getRecipes() {
    return this.state.recipes;
  }
  async setRecipe(menuItemId: string, lines: RecipeLine[]) {
    if (lines.length === 0) delete this.state.recipes[menuItemId];
    else this.state.recipes[menuItemId] = lines.map((l) => ({ ...l }));
    this.pushLog("Gerencia", `Actualizó la receta de ${menuItemId}`);
    this.persist();
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
  /** Next sequential folio for a serie, derived from stored comprobantes so it survives reloads. */
  private nextFolio(serie: string): string {
    const used = this.state.comprobantes
      .filter((c) => c.folio.startsWith(serie))
      .map((c) => parseInt(c.folio.split("-")[1] ?? "0", 10))
      .filter((n) => !Number.isNaN(n));
    const next = (used.length ? Math.max(...used) : 1000) + 1;
    return `${serie}-${String(next).padStart(4, "0")}`;
  }

  async getComprobantes() {
    return [...this.state.comprobantes].sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  }

  async emitComprobante(input: EmitComprobanteInput, online: boolean): Promise<Comprobante> {
    const cpe: Comprobante = {
      id: uid("cpe"),
      folio: this.nextFolio(input.tipo === "Factura" ? "F001" : "B001"),
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
      if (res.accepted) demoArtifacts(cpe);
    }
    this.pushLog("SUNAT", `${input.tipo} ${cpe.folio} · ${cpe.status}`);
    this.persist();
    return cpe;
  }

  async emitNotaCredito(originalId: string, motivo: string, online: boolean): Promise<Comprobante> {
    const original = this.state.comprobantes.find((c) => c.id === originalId);
    if (!original) throw new Error("Comprobante no encontrado");
    if (original.tipo === "NotaCredito") throw new Error("No se puede anular una nota de crédito");
    const serie = original.folio.startsWith("F") ? "FC01" : "BC01";
    const nc: Comprobante = {
      id: uid("cpe"),
      folio: this.nextFolio(serie),
      tipo: "NotaCredito",
      buyerRuc: original.buyerRuc,
      buyerName: original.buyerName,
      subtotal: original.subtotal,
      igv: original.igv,
      total: original.total,
      reference: `Anula ${original.folio}`,
      status: online ? "enviando" : "encola",
      error: null,
      issuedAt: new Date().toISOString(),
      refFolio: original.folio,
      motivo,
    };
    this.state.comprobantes.unshift(nc);
    if (online) {
      const res = await stubSunatGateway.submit(nc);
      nc.status = res.accepted ? "aceptada" : "rechazada";
      nc.error = res.error ?? null;
      if (res.accepted) demoArtifacts(nc);
    }
    this.pushLog("SUNAT", `Nota de crédito ${nc.folio} · anula ${original.folio} · ${nc.status}`);
    this.persist();
    return nc;
  }

  async sendResumenDiario(online: boolean): Promise<ResumenDiario> {
    const today = new Date().toISOString().slice(0, 10);
    const boletas = this.state.comprobantes.filter(
      (c) => c.tipo === "Boleta" && c.issuedAt.slice(0, 10) === today && c.status === "aceptada",
    );
    const total = Math.round(boletas.reduce((s, c) => s + c.total, 0) * 100) / 100;
    const folio = `RC-${today.replace(/-/g, "")}-1`;
    const resumen: ResumenDiario = {
      folio,
      fecha: today,
      count: boletas.length,
      total,
      status: online ? "aceptada" : "encola",
    };
    this.pushLog("SUNAT", `Resumen diario ${folio} · ${boletas.length} boleta(s) · ${resumen.status}`);
    this.persist();
    return resumen;
  }

  async comunicarBaja(comprobanteId: string, motivo: string, online: boolean): Promise<BajaResult> {
    const cpe = this.state.comprobantes.find((c) => c.id === comprobanteId);
    if (!cpe) throw new Error("Comprobante no encontrado");
    if (cpe.tipo !== "Factura") throw new Error("La comunicación de baja aplica a facturas");
    const today = new Date().toISOString().slice(0, 10);
    const folio = `RA-${today.replace(/-/g, "")}-1`;
    // Demo: marca el comprobante como anulado (rechazada + nota) para reflejar la baja.
    cpe.status = "rechazada";
    cpe.error = `Dada de baja: ${motivo}`;
    this.pushLog("SUNAT", `Comunicación de baja ${folio} · ${cpe.folio} · ${motivo}`);
    this.persist();
    return { folio, refFolio: cpe.folio, status: online ? "aceptada" : "encola" };
  }

  async syncSunat(online: boolean): Promise<number> {
    if (!online) return 0;
    let sent = 0;
    for (const cpe of this.state.comprobantes) {
      if (cpe.status === "encola") {
        const res = await stubSunatGateway.submit(cpe);
        cpe.status = res.accepted ? "aceptada" : "rechazada";
        cpe.error = res.error ?? null;
        if (res.accepted) {
          demoArtifacts(cpe);
          sent++;
        }
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
    if (res.accepted) demoArtifacts(cpe);
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
  async setCardCredentials(input: CardCredentialsInput) {
    // Demo: no se persisten las credenciales secretas (solo se registra el cambio).
    this.pushLog("Ajustes", `Configuró credenciales de ${input.provider}`);
    this.persist();
  }
  async setFiscalCredentials(input: FiscalCredentialsInput) {
    // Demo: no se persisten las credenciales secretas (solo se registra el cambio).
    this.pushLog("Ajustes", `Configuró credenciales de facturación (${input.provider})`);
    this.persist();
  }
  async chargeCard(input: CardChargeInput): Promise<CardChargeResult> {
    // Demo: simula un cargo aprobado (en producción lo hace la Edge Function).
    this.pushLog("Caja", `Cargo con tarjeta S/ ${input.amount.toFixed(2)} (demo)`);
    this.persist();
    return { success: true, chargeId: `chg_demo_${Math.random().toString(36).slice(2, 10)}` };
  }
  async getActivityLog() {
    return [...this.state.log];
  }
}
