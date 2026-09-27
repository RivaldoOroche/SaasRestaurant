// Repo que ve la aplicación: une el backend (demo o Supabase) con el motor de
// sincronización. Las operaciones del salón pasan por la cola offline; el resto
// se delega al backend, guardando las lecturas para poder abrir la app sin red.
import type { BackendRepo, PayInput, PosMethod, Repo, TerminalInfo } from "../Repo";
import type {
  Comprobante,
  DeliveryDriver,
  DeliveryOrder,
  DeliveryStatus,
  DeliveryZone,
  DraftLine,
  EmitComprobanteInput,
  InventoryItem,
  KitchenTicket,
  NewDeliveryInput,
  Order,
  RestaurantTable,
} from "../model";
import { makeOp, uuid, type PosOpBody } from "../pos/ops";
import { OpError } from "../pos/reduce";
import { SyncEngine } from "./engine";
import { deviceId, type KV } from "./kv";
import { validateNewDelivery } from "@/lib/delivery";
import { loadSession } from "@/auth/session";

export interface PosServiceOptions {
  kv: KV;
  /** Clave del tenant (separa los datos locales de cada restaurante). */
  tenantKey: string;
  isOnline: () => boolean;
  /** Suscripción a cambios de conectividad. */
  onConnectivity: (cb: () => void) => () => void;
}

const OPEN = (o: Order) => o.status !== "cobrada" && o.status !== "anulada";
const byBranch = <T extends { branchId?: string | null }>(branchId?: string | null) => (x: T) =>
  !branchId || x.branchId === branchId;

/** Error de red (sin respuesta del servidor), a diferencia de un rechazo. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String((e as { message?: string })?.message ?? e);
  return e instanceof TypeError || /fetch|network|load failed|timeout|offline|conexi/i.test(msg);
}

function actor(): string {
  return loadSession()?.staff?.name ?? "POS";
}

class PosService {
  readonly engine: SyncEngine;
  private zones: DeliveryZone[] = [];
  private drivers: DeliveryDriver[] = [];
  private terminalInfo: TerminalInfo | null = null;
  private started: (() => void) | null = null;
  private subscribers = 0;
  private catalogReady: Promise<void>;

  constructor(
    private backend: BackendRepo,
    private o: PosServiceOptions,
  ) {
    this.engine = new SyncEngine({
      backend,
      kv: o.kv,
      key: `pos:${o.tenantKey}`,
      isOnline: o.isOnline,
      catalog: () => ({ zones: this.zones, drivers: this.drivers }),
    });
    this.catalogReady = this.loadCatalog();
  }

  // ---- Catálogo y terminal (para validar y numerar sin conexión) ----------
  private async loadCatalog() {
    const [zones, drivers, term] = await Promise.all([
      this.cachedRead("getDeliveryZones", [], () => this.backend.getDeliveryZones()).catch(() => []),
      this.cachedRead("getDrivers", [], () => this.backend.getDrivers()).catch(() => []),
      this.o.kv.get<TerminalInfo>(`terminal:${this.o.tenantKey}`),
    ]);
    this.zones = zones;
    this.drivers = drivers;
    this.terminalInfo = term ?? null;
    if (this.o.isOnline()) void this.refreshTerminal();
  }

  private async refreshTerminal() {
    try {
      const t = await this.backend.terminal(deviceId());
      const local = this.terminalInfo;
      // La terminal es la única que usa su serie: el correlativo local nunca retrocede.
      this.terminalInfo =
        local && local.serieBoleta === t.serieBoleta
          ? { ...t, lastBoleta: Math.max(t.lastBoleta, local.lastBoleta), lastFactura: Math.max(t.lastFactura, local.lastFactura) }
          : t;
      await this.o.kv.set(`terminal:${this.o.tenantKey}`, this.terminalInfo);
    } catch {
      /* sin red: se usará al volver */
    }
  }

  private async nextFolio(tipo: "Boleta" | "Factura"): Promise<{ serie: string; number: number | null }> {
    const t = this.terminalInfo;
    if (!t) return { serie: tipo === "Factura" ? "F001" : "B001", number: null }; // el servidor numera
    const key = tipo === "Factura" ? "lastFactura" : "lastBoleta";
    const number = t[key] + 1;
    this.terminalInfo = { ...t, [key]: number };
    await this.o.kv.set(`terminal:${this.o.tenantKey}`, this.terminalInfo);
    return { serie: tipo === "Factura" ? t.serieFactura : t.serieBoleta, number };
  }

  /** Lectura con respaldo local: sin red devuelve lo último que se vio. */
  async cachedRead<T>(name: string, args: unknown[], fn: () => Promise<T>): Promise<T> {
    if (!this.backend.remote) return fn();
    const key = `cache:${this.o.tenantKey}:${name}:${JSON.stringify(args)}`;
    if (!this.o.isOnline()) {
      const hit = await this.o.kv.get<T>(key);
      if (hit !== undefined) return hit;
    }
    try {
      const v = await fn();
      void this.o.kv.set(key, v);
      return v;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      const hit = await this.o.kv.get<T>(key);
      if (hit === undefined) throw e;
      return hit;
    }
  }

  private async run(body: PosOpBody) {
    return this.engine.submit(makeOp(body, actor()));
  }

  private async view() {
    await this.catalogReady;
    await this.engine.ready();
    return this.engine.view();
  }

  // ---- Lecturas operativas (instantáneas, desde la vista local) -----------
  async getTables(branchId?: string | null): Promise<RestaurantTable[]> {
    return (await this.view()).tables.filter(byBranch(branchId));
  }
  async getOpenOrders(branchId?: string | null): Promise<Order[]> {
    return (await this.view()).orders.filter((o) => OPEN(o) && o.lines.length > 0 && byBranch(branchId)(o));
  }
  async getOpenOrderForTable(tableId: string): Promise<Order | null> {
    return (await this.view()).orders.find((o) => o.tableId === tableId && OPEN(o)) ?? null;
  }
  async getKitchenTickets(branchId?: string | null): Promise<KitchenTicket[]> {
    return (await this.view()).tickets.filter((k) => k.col !== "entregado" && byBranch(branchId)(k));
  }
  async getDeliveryOrders(): Promise<DeliveryOrder[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return (await this.view()).deliveries
      .filter((d) => !["entregado", "cancelado"].includes(d.status) || new Date(d.createdAt) >= start)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // ---- Lecturas remotas + lo hecho aquí que aún no llega al servidor ------
  async getPaidOrders(branchId?: string | null): Promise<Order[]> {
    const remote = await this.cachedRead("getPaidOrders", [branchId ?? null], () => this.backend.getPaidOrders(branchId));
    const known = new Set(remote.map((o) => o.id));
    const local = (await this.view()).orders.filter((o) => o.status === "cobrada" && !known.has(o.id) && byBranch(branchId)(o));
    return [...local, ...remote];
  }

  async getInventory(branchId?: string | null): Promise<InventoryItem[]> {
    const items = await this.cachedRead("getInventory", [branchId ?? null], () => this.backend.getInventory(branchId));
    const pending = this.engine.pendingOps().filter((op) => op.type === "inventory.adjust");
    if (!pending.length) return items;
    return items.map((it) => {
      const delta = pending.reduce(
        (s, op) => s + (op.type === "inventory.adjust" && op.item_id === it.id && (!branchId || op.branch_id === branchId) ? op.delta : 0),
        0,
      );
      return delta ? { ...it, stock: Math.round((it.stock + delta) * 1000) / 1000 } : it;
    });
  }

  async getComprobantes(): Promise<Comprobante[]> {
    const remote = await this.cachedRead("getComprobantes", [], () => this.backend.getComprobantes());
    const known = new Set(remote.map((c) => c.id));
    const local: Comprobante[] = [];
    for (const op of this.engine.pendingOps()) {
      if (op.type !== "cpe.emit" || known.has(op.cpe_id)) continue;
      local.unshift(this.localComprobante(op));
    }
    return [...local, ...remote];
  }

  private localComprobante(op: Extract<ReturnType<typeof makeOp>, { type: "cpe.emit" }>): Comprobante {
    return {
      id: op.cpe_id,
      folio: op.number != null ? `${op.serie}-${String(op.number).padStart(4, "0")}` : `${op.serie}-pendiente`,
      tipo: op.tipo,
      buyerRuc: op.buyer_ruc,
      buyerName: op.buyer_name,
      subtotal: op.subtotal,
      igv: op.igv,
      total: op.total,
      reference: op.reference,
      status: "encola",
      error: null,
      issuedAt: op.at,
    };
  }

  // ---- Operaciones ---------------------------------------------------------
  async openOrder(tableId: string): Promise<Order> {
    const existing = await this.getOpenOrderForTable(tableId);
    if (existing) return existing;
    await this.run({ type: "order.open", order_id: uuid(), table_id: tableId });
    const opened = await this.getOpenOrderForTable(tableId);
    if (!opened) throw new OpError("No se pudo abrir la mesa.");
    return opened;
  }
  async addLine(orderId: string, line: DraftLine): Promise<void> {
    await this.run({
      type: "line.add",
      line_id: uuid(),
      order_id: orderId,
      item_id: line.itemId || null,
      name: line.name,
      qty: line.qty,
      unit_price: line.unitPrice,
      extra_price: line.extraPrice,
      modifiers: line.modifiers,
    });
  }
  async setLineQty(lineId: string, qty: number): Promise<void> {
    await this.run(qty > 0 ? { type: "line.qty", line_id: lineId, qty } : { type: "line.remove", line_id: lineId });
  }
  async removeLine(lineId: string): Promise<void> {
    await this.run({ type: "line.remove", line_id: lineId });
  }
  async voidLine(lineId: string, reason: string, who: string): Promise<void> {
    await this.engine.submit(makeOp({ type: "line.void", line_id: lineId, reason }, who || actor()));
  }
  async clearOrder(orderId: string): Promise<void> {
    await this.run({ type: "order.clear", order_id: orderId });
  }
  async transferOrder(orderId: string, toTableId: string): Promise<void> {
    await this.run({ type: "order.transfer", order_id: orderId, to_table_id: toTableId });
  }
  async mergeOrder(orderId: string, intoTableId: string): Promise<void> {
    await this.run({ type: "order.merge", order_id: orderId, into_table_id: intoTableId });
  }
  async sendToKitchen(orderId: string): Promise<void> {
    await this.run({ type: "order.send", order_id: orderId, ticket_id: uuid() });
  }
  async payOrder(input: PayInput): Promise<void> {
    await this.run({
      type: "order.pay",
      order_id: input.orderId,
      method: input.method,
      total: input.total,
      customer_id: input.customerId ?? null,
      redeem: input.redeem ?? 0,
    });
  }
  async advanceTicket(ticketId: string): Promise<void> {
    const k = (await this.view()).tickets.find((x) => x.id === ticketId);
    if (!k) return;
    await this.run({ type: "ticket.advance", ticket_id: ticketId, from: k.col });
  }

  async createDeliveryOrder(input: NewDeliveryInput): Promise<DeliveryOrder> {
    await this.catalogReady;
    const err = validateNewDelivery(input, this.zones);
    if (err) throw new OpError(err);
    const id = uuid();
    await this.run({
      type: "delivery.create",
      order_id: id,
      channel: input.channel,
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.replace(/\D/g, "").slice(-9),
      address: input.address.trim(),
      reference: input.reference.trim(),
      zone_id: input.zoneId,
      pay_method: input.payMethod,
      cash_for: input.payMethod === "efectivo" ? input.cashFor : null,
      notes: input.notes.trim(),
      branch_id: input.branchId ?? null,
      lines: input.items.map((i) => ({ line_id: uuid(), name: i.name, qty: i.qty, price: i.price })),
    });
    const d = (await this.view()).deliveries.find((x) => x.id === id);
    if (!d) throw new OpError("No se pudo registrar el pedido.");
    return d;
  }

  async setDeliveryStatus(
    id: string,
    to: DeliveryStatus,
    opts: { driverId?: string | null; cancelReason?: string } = {},
  ): Promise<void> {
    const d = (await this.view()).deliveries.find((x) => x.id === id);
    if (!d) throw new OpError("El pedido de delivery ya no existe.");
    await this.run({
      type: "delivery.status",
      order_id: id,
      from: d.status,
      to,
      driver_id: opts.driverId ?? null,
      cancel_reason: opts.cancelReason,
      ticket_id: to === "preparando" ? uuid() : undefined,
    });
  }

  async adjustInventory(itemId: string, delta: number, who: string, branchId?: string | null): Promise<void> {
    await this.engine.submit(
      makeOp({ type: "inventory.adjust", item_id: itemId, branch_id: branchId ?? null, delta, reason: "ajuste" }, who || actor()),
    );
  }

  /**
   * Emite con el correlativo de ESTA caja (válido sin conexión). Con red, el
   * comprobante se envía a SUNAT al momento; sin red queda "en cola" y se
   * envía solo al volver la conexión.
   */
  async emitComprobante(input: EmitComprobanteInput, _online?: boolean): Promise<Comprobante> {
    if (input.tipo === "NotaCredito") throw new OpError("Las notas de crédito se emiten desde SUNAT.");
    const { serie, number } = await this.nextFolio(input.tipo);
    const op = makeOp(
      {
        type: "cpe.emit",
        cpe_id: uuid(),
        order_id: input.orderId ?? null,
        tipo: input.tipo,
        serie,
        number,
        buyer_ruc: input.buyerRuc ?? null,
        buyer_name: input.buyerName ?? null,
        subtotal: input.subtotal,
        igv: input.igv,
        total: input.total,
        reference: input.reference,
      },
      actor(),
    );
    if (op.type !== "cpe.emit") throw new Error("unreachable");
    const res = await this.engine.submit(op);
    const local = { ...this.localComprobante(op), folio: typeof res.folio === "string" ? res.folio : this.localComprobante(op).folio };
    if (!this.o.isOnline() || this.engine.getStatus().pending > 0) return local;
    try {
      await this.backend.retryComprobante(op.cpe_id, true);
      const fresh = (await this.backend.getComprobantes()).find((c) => c.id === op.cpe_id);
      return fresh ?? local;
    } catch {
      return local;
    }
  }

  // ---- Suscripciones y estado de sincronización ---------------------------
  subscribe(cb: (reason: "view" | "synced") => void): () => void {
    let lastSync = this.engine.getStatus().lastSyncAt;
    const offEngine = this.engine.subscribe(() => {
      const s = this.engine.getStatus();
      cb("view");
      if (s.lastSyncAt !== lastSync) {
        lastSync = s.lastSyncAt;
        cb("synced");
        // Comprobantes emitidos sin conexión: enviarlos a SUNAT ya sincronizados.
        if (this.o.isOnline() && this.engine.pendingOps().some((op) => op.type === "cpe.emit")) {
          void this.backend.syncSunat(true).then((n) => n > 0 && cb("synced"));
        }
      }
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const offRemote = this.backend.onRemoteChange(() => {
      // Ráfagas de eventos (p. ej. un cobro toca pedido, líneas y mesa) → una sola lectura.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void this.engine.pull(), 250);
    });
    const offNet = this.o.onConnectivity(() => {
      this.engine.connectivityChanged();
      if (this.o.isOnline()) {
        void this.refreshTerminal();
        this.catalogReady = this.loadCatalog();
      }
    });
    if (this.subscribers++ === 0) this.started = this.engine.start();
    void this.engine.ready();
    return () => {
      offEngine();
      offRemote();
      offNet();
      if (timer) clearTimeout(timer);
      if (--this.subscribers === 0) {
        this.started?.();
        this.started = null;
      }
    };
  }

  syncStatus() {
    return this.engine.getStatus();
  }
  onSyncStatus(cb: () => void) {
    return this.engine.subscribe(cb);
  }
  dismissRejected(opId?: string) {
    this.engine.dismissRejected(opId);
  }
  async syncNow() {
    await this.engine.flush();
    await this.engine.pull();
  }

  /** Refresca el catálogo de delivery tras editar zonas o repartidores. */
  catalogChanged() {
    this.catalogReady = this.loadCatalog();
  }
}

const POS_METHODS: PosMethod[] = [
  "getTables", "getOpenOrders", "getOpenOrderForTable", "openOrder", "addLine", "setLineQty", "removeLine",
  "voidLine", "clearOrder", "transferOrder", "mergeOrder", "sendToKitchen", "payOrder", "getKitchenTickets",
  "advanceTicket", "getDeliveryOrders", "createDeliveryOrder", "setDeliveryStatus", "adjustInventory",
  "emitComprobante", "subscribe", "syncStatus", "onSyncStatus", "dismissRejected", "syncNow",
];
const OVERLAID = new Set(["getPaidOrders", "getInventory", "getComprobantes"]);
/** Lecturas que conviene tener sin conexión (abrir la app y tomar pedidos). */
const CACHED = new Set([
  "getCategories", "getMenuItems", "getExtras", "getPrefs", "getBranches", "getStaff", "getSettings",
  "getCustomers", "getRecipes", "getDeliveryZones", "getDrivers", "getRolePermissions", "getSubscription",
  "getReservations", "getWaitlist", "getActivityLog", "getBranchSales", "getBranchQuota",
]);
/** Escrituras administrativas tras las que hay que releer el estado operativo. */
const REFRESH_AFTER = new Set(["addTable", "updateTable", "removeTable"]);
const CATALOG_AFTER = new Set(["saveDeliveryZone", "removeDeliveryZone", "saveDriver", "removeDriver"]);

/** Compone el Repo final: operaciones offline-first + backend. */
export function createRepo(backend: BackendRepo, opts: PosServiceOptions): Repo & { service: PosService } {
  const svc = new PosService(backend, opts);
  const pos = new Set<string>([...POS_METHODS, ...OVERLAID]);
  return new Proxy({} as Repo & { service: PosService }, {
    get(_t, prop: string) {
      if (prop === "service") return svc;
      if (pos.has(prop)) {
        const fn = (svc as unknown as Record<string, (...a: unknown[]) => unknown>)[prop];
        return fn.bind(svc);
      }
      const target = (backend as unknown as Record<string, unknown>)[prop];
      if (typeof target !== "function") return target;
      const call = (...args: unknown[]) => (target as (...a: unknown[]) => unknown).apply(backend, args);
      if (CACHED.has(prop)) return (...args: unknown[]) => svc.cachedRead(prop, args, () => call(...args) as Promise<unknown>);
      if (REFRESH_AFTER.has(prop))
        return async (...args: unknown[]) => {
          await call(...args);
          await svc.engine.pull();
        };
      if (CATALOG_AFTER.has(prop))
        return async (...args: unknown[]) => {
          await call(...args);
          svc.catalogChanged();
        };
      return call;
    },
  });
}
