import type { BackendRepo, BranchInput, TerminalInfo } from "../Repo";
import type {
  Order,
  KitchenTicket,
  RestaurantTable,
  Customer,
  InventoryItem,
  LogEntry,
  BusinessSettings,
  MenuChange,
  MenuItem,
  RecipeLine,
  Comprobante,
  ResumenDiario,
  BajaResult,
  FiscalCredentialsInput,
  CardCredentialsInput,
  Complaint,
  Reservation,
  WaitlistEntry,
  Subscription,
  MyPlanRequest,
  CardChargeInput,
  CardChargeResult,
  DeliveryZone,
  DeliveryDriver,
  DeliveryOrder,
  DeliveryTracking,
  BranchQuota,
} from "../model";
import { deliveryTotals, isAggregator } from "@/lib/delivery";
import { applyOp, OpError, type ReduceCtx } from "../pos/reduce";
import type { OpResult, PosOp, PosSnapshot } from "../pos/ops";
import { planInfo, quotaExceededMessage } from "@/lib/plans";
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
  seedStock,
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
  /** Catálogo de insumos (el stock de cada sucursal va en `stock`). */
  inventory: InventoryItem[];
  /** stock[branchId][itemId] */
  stock: Record<string, Record<string, number>>;
  log: LogEntry[];
  settings: BusinessSettings;
  changes: MenuChange[];
  menuOverrides: Record<string, MenuOverride>;
  comprobantes: Comprobante[];
  branches: Branch[];
  staff: MockStaff[];
  recipes: Record<string, RecipeLine[]>;
  deliveryZones: DeliveryZone[];
  drivers: DeliveryDriver[];
  deliveries: DeliveryOrder[];
  deliverySeq: number;
  plan: string;
  /** Operaciones ya aplicadas (idempotencia, como pos_ops). */
  applied: Record<string, OpResult>;
  aliases: [string, string][];
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

const KEY = "nubepos-mock-v5";

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

function freshState(): MockState {
  return {
    tables: seedTables(),
    orders: [],
    tickets: [],
    customers: CUSTOMERS.map((c) => ({ ...c })),
    inventory: seedInventory(),
    stock: seedStock(),
    log: [],
    settings: { ...DEFAULT_SETTINGS },
    changes: seedMenuChanges(),
    menuOverrides: {},
    comprobantes: [],
    branches: BRANCHES.map((b) => ({ ...b })),
    staff: seedStaff(),
    recipes: JSON.parse(JSON.stringify(RECIPES)) as Record<string, RecipeLine[]>,
    ...seedDelivery(),
    plan: "Pro",
    applied: {},
    aliases: [],
  };
}

function loadState(): MockState {
  try {
    const raw = localStorage.getItem(KEY);
    // Merge: un estado guardado por una versión anterior recibe los campos nuevos.
    if (raw) return { ...freshState(), ...(JSON.parse(raw) as Partial<MockState>) };
  } catch {
    /* ignore */
  }
  // Se guarda de inmediato: si no, los datos de ejemplo (ids, tokens de
  // seguimiento) serían distintos en cada carga y los enlaces no funcionarían.
  const fresh = freshState();
  try {
    localStorage.setItem(KEY, JSON.stringify(fresh));
  } catch {
    /* ignore */
  }
  return fresh;
}

const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const randToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Demo: zonas, repartidores y un tablero de delivery con pedidos en cada estado. */
function seedDelivery(): Pick<MockState, "deliveryZones" | "drivers" | "deliveries" | "deliverySeq"> {
  const zones: DeliveryZone[] = [
    { id: "dz-mira", name: "Miraflores", fee: 5, etaMin: 35, active: true },
    { id: "dz-sisi", name: "San Isidro", fee: 6, etaMin: 40, active: true },
    { id: "dz-barr", name: "Barranco", fee: 7, etaMin: 45, active: true },
    { id: "dz-surc", name: "Surco", fee: 10, etaMin: 60, active: false },
  ];
  const drivers: DeliveryDriver[] = [
    { id: "dr-jose", name: "José Huamán", phone: "987111222", vehicle: "moto", active: true },
    { id: "dr-lucia", name: "Lucía Paredes", phone: "986333444", vehicle: "bici", active: true },
    { id: "dr-pedro", name: "Pedro Ríos", phone: "985555666", vehicle: "auto", active: false },
  ];
  const mk = (
    n: number,
    o: Partial<DeliveryOrder> & Pick<DeliveryOrder, "channel" | "customerName" | "status" | "items" | "payMethod">,
    ago: number,
  ): DeliveryOrder => {
    const zone = o.zoneId ? zones.find((z) => z.id === o.zoneId) : undefined;
    const t = deliveryTotals(o.items, isAggregator(o.channel) ? 0 : zone?.fee ?? 0);
    return {
      id: `dl-${n}`,
      code: `D-${n}`,
      trackingToken: randToken(),
      customerPhone: "",
      address: "",
      reference: "",
      zoneId: null,
      zoneName: zone?.name ?? "",
      cashFor: null,
      driverId: null,
      driverName: null,
      notes: "",
      cancelReason: null,
      etaMin: zone?.etaMin ?? 30,
      branchId: "br-1",
      createdAt: minsAgo(ago),
      acceptedAt: null,
      readyAt: null,
      dispatchedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      ...t,
      ...o,
    };
  };
  const deliveries: DeliveryOrder[] = [
    mk(1005, { channel: "whatsapp", customerName: "Rosa Quispe", customerPhone: "987654321", address: "Av. Larco 345, dpto 802", reference: "Frente al parque", zoneId: "dz-mira", status: "recibido", payMethod: "efectivo", cashFor: 100, items: [{ name: "Lomo saltado", qty: 2, price: 42 }] }, 3),
    mk(1004, { channel: "telefono", customerName: "Jorge Salas", customerPhone: "986222111", address: "Calle Los Pinos 120", zoneId: "dz-sisi", status: "preparando", payMethod: "yape", acceptedAt: minsAgo(12), items: [{ name: "Ceviche clásico", qty: 1, price: 38 }, { name: "Chicha morada 1L", qty: 1, price: 12 }] }, 14),
    mk(1003, { channel: "rappi", customerName: "Rappi · pedido 88213", status: "listo", payMethod: "pagado_app", acceptedAt: minsAgo(25), readyAt: minsAgo(4), items: [{ name: "Ají de gallina", qty: 1, price: 32 }] }, 27),
    mk(1002, { channel: "web", customerName: "Valeria Chang", customerPhone: "985777888", address: "Jr. Batallón Ayacucho 210", zoneId: "dz-barr", status: "en_camino", payMethod: "tarjeta", driverId: "dr-jose", driverName: "José Huamán", acceptedAt: minsAgo(44), readyAt: minsAgo(20), dispatchedAt: minsAgo(15), items: [{ name: "Arroz con mariscos", qty: 2, price: 45 }] }, 50),
    mk(1001, { channel: "whatsapp", customerName: "Luis Paredes", customerPhone: "984999000", address: "Av. Pardo 500", zoneId: "dz-mira", status: "entregado", payMethod: "plin", driverId: "dr-lucia", driverName: "Lucía Paredes", acceptedAt: minsAgo(95), readyAt: minsAgo(75), dispatchedAt: minsAgo(70), deliveredAt: minsAgo(52), items: [{ name: "Causa limeña", qty: 2, price: 24 }] }, 100),
  ];
  return { deliveryZones: zones, drivers, deliveries, deliverySeq: 1006 };
}

/**
 * Backend del modo demo, en el navegador. Hace de "servidor": aplica las
 * operaciones del POS con las mismas reglas que Supabase (src/data/pos/reduce)
 * y sus efectos (inventario, lealtad, bitácora, comprobantes).
 */
export class MockRepo implements BackendRepo {
  readonly remote = false;
  private state: MockState = loadState();
  private listeners = new Set<() => void>();
  private complaints?: Complaint[]; // demo: en memoria

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

  /** Cambios de "otros dispositivos": en la demo, otras pestañas del navegador. */
  onRemoteChange(cb: () => void): () => void {
    this.listeners.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      this.state = loadState();
      cb();
    };
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      this.listeners.delete(cb);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
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

  private root(): Branch {
    return this.state.branches.find((b) => !b.parentId)!;
  }
  private activeChildren(exceptId?: string) {
    return this.state.branches.filter((b) => b.parentId && b.active !== false && b.id !== exceptId).length;
  }
  /** Misma regla que el trigger branches_quota_guard. */
  private checkQuota(exceptId?: string) {
    const { maxBranches, tier } = planInfo(this.state.plan);
    if (maxBranches !== null && this.activeChildren(exceptId) >= maxBranches) {
      throw new Error(quotaExceededMessage(tier, maxBranches));
    }
  }
  /** Misma regla que branches_tree_guard: sin ciclos, hasta 5 niveles. */
  private checkParent(id: string | null, parentId: string) {
    let cur: string | null | undefined = parentId;
    for (let depth = 0; cur; depth++) {
      if (cur === id) throw new Error("Una sucursal no puede depender de sí misma ni de sus propias sucursales.");
      if (depth >= 5) throw new Error("El árbol de sucursales admite hasta 5 niveles.");
      cur = this.state.branches.find((b) => b.id === cur)?.parentId;
    }
    if (!this.state.branches.some((b) => b.id === parentId)) throw new Error("La sucursal padre no existe.");
  }

  async addBranch(input: BranchInput) {
    const parentId = input.parentId ?? this.root().id;
    this.checkParent(null, parentId);
    this.checkQuota();
    this.state.branches.push({
      id: uid("br"),
      name: input.name,
      city: input.city,
      parentId,
      active: true,
      address: input.address ?? "",
      phone: input.phone ?? "",
    });
    this.pushLog("Dueño", `Creó sucursal ${input.name}`);
    this.persist();
  }
  async updateBranch(id: string, patch: Partial<BranchInput & { active: boolean }>) {
    const b = this.state.branches.find((x) => x.id === id);
    if (!b) return;
    if (patch.parentId !== undefined) {
      if (!b.parentId && patch.parentId) throw new Error("La sede principal no puede depender de otra sucursal.");
      if (b.parentId && !patch.parentId) throw new Error("Ya existe una sede principal; una sucursal no puede convertirse en principal.");
      if (patch.parentId) this.checkParent(id, patch.parentId);
    }
    if (patch.active === true && b.active === false && b.parentId) this.checkQuota(id);
    Object.assign(b, patch);
    this.pushLog("Dueño", `Editó sucursal ${b.name}`);
    this.persist();
  }
  async removeBranch(id: string) {
    const b = this.state.branches.find((x) => x.id === id);
    if (!b) return;
    if (!b.parentId) throw new Error("La sede principal no se puede eliminar.");
    if (this.state.branches.some((x) => x.parentId === id)) throw new Error("La sucursal tiene sucursales dependientes; muévelas primero.");
    if (this.state.tables.some((t) => t.branchId === id) || this.state.orders.some((o) => o.branchId === id)) {
      throw new Error("La sucursal tiene mesas o ventas registradas; desactívala en lugar de eliminarla.");
    }
    this.state.branches = this.state.branches.filter((x) => x.id !== id);
    this.pushLog("Dueño", `Eliminó sucursal ${b.name}`);
    this.persist();
  }
  async getBranchQuota(): Promise<BranchQuota> {
    const { tier, maxBranches } = planInfo(this.state.plan);
    const used = this.activeChildren();
    return { plan: tier, used, max: maxBranches, remaining: maxBranches === null ? null : Math.max(0, maxBranches - used) };
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

  async addTable(input: { zone: string; number: number; seats: number; branchId: string | null; count?: number }) {
    const count = Math.max(1, input.count ?? 1);
    const branchId = input.branchId ?? this.root().id;
    for (let i = 0; i < count; i++) {
      if (this.state.tables.some((t) => t.branchId === branchId && t.number === input.number + i)) {
        throw new Error(`La Mesa ${input.number + i} ya existe en esta sucursal.`);
      }
    }
    for (let i = 0; i < count; i++) {
      this.state.tables.push({
        id: uid("t"),
        zone: input.zone,
        number: input.number + i,
        seats: input.seats,
        status: "libre",
        waiterId: null,
        branchId,
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

  // ---- Operaciones del POS (backend) ----
  private ctx(): ReduceCtx {
    const aliases = new Map(this.state.aliases);
    return {
      zones: this.state.deliveryZones,
      drivers: this.state.drivers,
      aliases,
      deliveryIds: () => ({ code: `D-${this.state.deliverySeq++}`, trackingToken: randToken() }),
    };
  }

  /** La demo siempre entrega el estado completo (no hay delta). */
  async snapshot(_since?: string | null): Promise<PosSnapshot> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const s = structuredClone(this.state);
    return {
      serverTime: new Date().toISOString(),
      full: true,
      tables: s.tables,
      orders: s.orders.filter((o) => o.kind !== "delivery" && o.status !== "cobrada" && o.status !== "anulada"),
      tickets: s.tickets.filter((k) => k.col !== "entregado"),
      deliveries: s.deliveries.filter(
        (d) => !["entregado", "cancelado"].includes(d.status) || new Date(d.createdAt) >= start,
      ),
    };
  }

  async apply(ops: PosOp[]): Promise<OpResult[]> {
    const out: OpResult[] = [];
    for (const op of ops) {
      const prev = this.state.applied[op.id];
      if (prev) {
        out.push({ ...prev, dup: true });
        continue;
      }
      let res: OpResult;
      // Cada operación es atómica: si falla, se descarta lo que alcanzó a cambiar.
      const backup = JSON.stringify(this.state);
      try {
        const ctx = this.ctx();
        const result = applyOp(this.state, op, ctx);
        this.state.aliases = [...ctx.aliases];
        this.effects(op, result);
        res = { id: op.id, status: "ok", result };
      } catch (e) {
        if (!(e instanceof OpError) && !(e instanceof Error)) throw e;
        this.state = JSON.parse(backup) as MockState;
        res = { id: op.id, status: "error", error: (e as Error).message };
      }
      this.state.applied[op.id] = res;
      out.push(res);
    }
    // Límite del registro de idempotencia en la demo.
    const keys = Object.keys(this.state.applied);
    if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete this.state.applied[k];
    this.persist();
    return out;
  }

  /** Efectos de "servidor" de cada operación (espejo de app.pos_exec). */
  private effects(op: PosOp, result: Record<string, unknown>) {
    const who = op.actor || "POS";
    switch (op.type) {
      case "order.send":
        if (Number(result.lines) > 0) this.pushLog(who, `Envió comanda a cocina`);
        break;
      case "line.void":
        this.pushLog(who, `Anuló un plato · ${op.reason}`);
        break;
      case "order.pay": {
        const order = this.state.orders.find((o) => o.id === op.order_id || o.id === new Map(this.state.aliases).get(op.order_id));
        if (!order) break;
        this.deductInventory(order.branchId ?? this.root().id, order.lines);
        if (op.customer_id) {
          const cust = this.state.customers.find((c) => c.id === op.customer_id);
          if (cust) {
            const redeem = op.redeem ?? 0;
            const due = Math.max(0, op.total - redeem);
            cust.points = Math.max(0, cust.points - redeem + Math.floor(due / 10));
            cust.visits += 1;
            cust.spent = Math.round((cust.spent + due) * 100) / 100;
          }
        }
        this.pushLog(who, `Cobró Mesa ${order.tableLabel} · ${op.method} · S/ ${op.total.toFixed(2)}`);
        break;
      }
      case "delivery.create": {
        const d = this.state.deliveries.find((x) => x.id === op.order_id);
        if (d) this.pushLog(who, `Nuevo delivery ${d.code} (${d.channel}) · S/ ${d.total.toFixed(2)}`);
        break;
      }
      case "delivery.status": {
        const d = this.state.deliveries.find((x) => x.id === op.order_id);
        if (!d) break;
        if (op.to === "entregado") {
          // El delivery entregado es una venta más (reportes, caja, comparativa).
          this.state.orders.push({
            id: d.id,
            tableId: null,
            tableLabel: d.code,
            seats: 0,
            zone: "Delivery",
            kind: "delivery",
            status: "cobrada",
            openedAt: d.createdAt,
            closedAt: op.at,
            lines: d.items.map((i, n) => ({
              id: `${d.id}-${n}`,
              orderId: d.id,
              itemId: null,
              name: i.name,
              qty: i.qty,
              unitPrice: i.price,
              extraPrice: 0,
              modifiers: "",
              splitPayer: null,
            })),
            paidMethod: d.payMethod === "pagado_app" ? "app" : d.payMethod,
            paidTotal: d.total,
            branchId: d.branchId,
          });
        }
        this.pushLog(who, `${d.code} → ${op.to}${op.cancel_reason ? ` (${op.cancel_reason})` : ""}`);
        break;
      }
      case "inventory.adjust": {
        const inv = this.state.inventory.find((i) => i.id === op.item_id);
        if (!inv) throw new OpError("El insumo ya no existe.");
        const branch = op.branch_id ?? this.root().id;
        const stock = (this.state.stock[branch] ??= {});
        stock[op.item_id] = Math.round(((stock[op.item_id] ?? 0) + op.delta) * 1000) / 1000;
        this.pushLog(who, `Ajustó ${inv.name} (${op.delta > 0 ? "+" : ""}${op.delta} ${inv.unit})`);
        break;
      }
      case "cpe.emit":
        Object.assign(result, this.emitFromOp(op));
        break;
    }
  }

  async terminal(): Promise<TerminalInfo> {
    const last = (serie: string) =>
      Math.max(1000, ...this.state.comprobantes.filter((c) => c.folio.startsWith(`${serie}-`)).map((c) => parseInt(c.folio.split("-")[1], 10) || 0));
    return { serieBoleta: "B001", serieFactura: "F001", lastBoleta: last("B001"), lastFactura: last("F001") };
  }

  async getPaidOrders(branchId?: string | null) {
    return this.state.orders
      .filter((o) => o.status === "cobrada" && (!branchId || o.branchId === branchId))
      .sort((a, b) => ((a.closedAt ?? a.openedAt) < (b.closedAt ?? b.openedAt) ? 1 : -1));
  }

  async getBranchSales(): Promise<BranchSales[]> {
    return this.state.branches.map((b) => {
      const paid = this.state.orders.filter((o) => o.status === "cobrada" && o.branchId === b.id);
      const sales = Math.round(paid.reduce((s, o) => s + (o.paidTotal ?? 0), 0) * 100) / 100;
      return { branchId: b.id, name: b.name, city: b.city, sales, orders: paid.length };
    });
  }

  /** Descuenta insumos por receta en la sucursal de la venta. */
  private deductInventory(branchId: string, lines: Order["lines"]) {
    const stock = (this.state.stock[branchId] ??= {});
    let n = 0;
    for (const line of lines) {
      for (const r of (line.itemId && this.state.recipes[line.itemId]) || []) {
        stock[r.inventoryId] = Math.round(((stock[r.inventoryId] ?? 0) - r.qtyPerUnit * line.qty) * 1000) / 1000;
        n++;
      }
    }
    if (n > 0) this.pushLog("Sistema", `Descontó insumos del inventario`);
  }

  // ---- CRM ----
  async getCustomers() {
    return [...this.state.customers];
  }

  // ---- Inventory ----
  async getInventory(branchId?: string | null): Promise<InventoryItem[]> {
    const branches = branchId ? [branchId] : Object.keys(this.state.stock);
    return this.state.inventory.map((it) => ({
      ...it,
      stock: Math.round(branches.reduce((s, b) => s + (this.state.stock[b]?.[it.id] ?? 0), 0) * 1000) / 1000,
    }));
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

  async getComprobanteDocs(id: string) {
    const c = this.state.comprobantes.find((x) => x.id === id);
    return { signedXml: c?.signedXml ?? null, cdr: c?.cdr ?? null };
  }

  async getComprobantes() {
    return [...this.state.comprobantes].sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  }

  /** cpe.emit: usa el correlativo de la caja si está libre; si no, el siguiente. */
  private emitFromOp(op: Extract<PosOp, { type: "cpe.emit" }>) {
    const existing = this.state.comprobantes.find((c) => c.id === op.cpe_id);
    if (existing) return { folio: existing.folio, status: existing.status };
    const proposed = op.number != null ? `${op.serie}-${String(op.number).padStart(4, "0")}` : null;
    const folio = proposed && !this.state.comprobantes.some((c) => c.folio === proposed) ? proposed : this.nextFolio(op.serie);
    this.state.comprobantes.unshift({
      id: op.cpe_id,
      folio,
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
    });
    this.pushLog("SUNAT", `${op.tipo} ${folio} · en cola`);
    return { folio, status: "encola" };
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
    return { slug: "la-higuera", ...this.state.settings };
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

  async getComplaints(): Promise<Complaint[]> {
    if (!this.complaints) {
      this.complaints = [
        {
          id: "cmp-1",
          correlativo: 1,
          consumerName: "Rosa Delgado",
          consumerDoc: "44556677",
          consumerDocType: "DNI",
          consumerEmail: "rosa@example.pe",
          itemType: "servicio",
          itemAmount: 128,
          itemDescription: "Almuerzo mesa 7",
          claimType: "reclamo",
          detail: "La demora en la atención superó los 40 minutos.",
          request: "Solicito una disculpa y una cortesía en mi próxima visita.",
          status: "pendiente",
          createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ];
    }
    return this.complaints.map((c) => ({ ...c }));
  }

  async respondComplaint(id: string, response: string) {
    const list = await this.getComplaints();
    const c = (this.complaints ?? list).find((x) => x.id === id);
    if (c) {
      c.status = "respondido";
      c.response = response;
      c.respondedAt = new Date().toISOString();
      this.pushLog("Reclamaciones", `Respondió la hoja N° ${c.correlativo}`);
      this.persist();
    }
  }

  private reservations: Reservation[] = [
    { id: "rsv-1", name: "Familia Quispe", phone: "999888777", partySize: 4, zone: "Terraza", date: new Date().toISOString().slice(0, 10), atTime: "20:30", status: "confirmada" },
    { id: "rsv-2", name: "Luis Ramírez", partySize: 2, zone: "Salón", date: new Date().toISOString().slice(0, 10), atTime: "21:00", status: "pendiente" },
  ];
  private waitlistEntries: WaitlistEntry[] = [
    { id: "wl-1", name: "Ana", partySize: 3, waitLabel: "~15 min", status: "esperando", createdAt: new Date().toISOString() },
  ];

  async getReservations() {
    return this.reservations.map((r) => ({ ...r }));
  }
  async addReservation(input: Omit<Reservation, "id" | "status">) {
    this.reservations.push({ ...input, id: `rsv-${Math.random().toString(36).slice(2, 8)}`, status: "pendiente" });
    this.pushLog("Reservas", `Reserva · ${input.name} (${input.partySize})`);
    this.persist();
  }
  async updateReservation(id: string, patch: Partial<Reservation>) {
    const r = this.reservations.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    this.persist();
  }
  async removeReservation(id: string) {
    this.reservations = this.reservations.filter((x) => x.id !== id);
    this.persist();
  }
  async getWaitlist() {
    return this.waitlistEntries.map((w) => ({ ...w }));
  }
  async addWaitlist(input: Omit<WaitlistEntry, "id" | "status" | "createdAt">) {
    this.waitlistEntries.push({ ...input, id: `wl-${Math.random().toString(36).slice(2, 8)}`, status: "esperando", createdAt: new Date().toISOString() });
    this.pushLog("Reservas", `Lista de espera · ${input.name}`);
    this.persist();
  }
  async updateWaitlist(id: string, patch: Partial<WaitlistEntry>) {
    const w = this.waitlistEntries.find((x) => x.id === id);
    if (w) Object.assign(w, patch);
    this.persist();
  }
  async removeWaitlist(id: string) {
    this.waitlistEntries = this.waitlistEntries.filter((x) => x.id !== id);
    this.persist();
  }

  private myPlanRequest: MyPlanRequest | null = null;
  async getSubscription(): Promise<Subscription> {
    return { plan: "Pro", price: 1499, status: "Activo" };
  }
  async getMyPlanRequest() {
    return this.myPlanRequest ? { ...this.myPlanRequest } : null;
  }
  async requestPlanChange(toPlan: string) {
    this.myPlanRequest = { toPlan, status: "pendiente" };
    this.pushLog("Plan", `Solicitó cambio de plan a ${toPlan}`);
    this.persist();
  }

  private rolePerms: Record<string, string[]> = {};
  async getRolePermissions() {
    return { ...this.rolePerms };
  }
  async setRolePermissions(role: string, screens: string[]) {
    this.rolePerms[role] = screens;
    this.pushLog("Permisos", `Actualizó permisos del rol ${role}`);
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

  private pushEndpoints = new Set<string>();
  async savePushSubscription(data: { endpoint: string; p256dh: string; auth: string }) {
    this.pushEndpoints.add(data.endpoint);
  }
  async removePushSubscription(endpoint: string) {
    this.pushEndpoints.delete(endpoint);
  }

  // ---- Delivery ----
  async getDeliveryZones() {
    return this.state.deliveryZones.map((z) => ({ ...z }));
  }
  async saveDeliveryZone(zone: Omit<DeliveryZone, "id"> & { id?: string }) {
    const i = this.state.deliveryZones.findIndex((z) => z.id === zone.id);
    if (i >= 0) this.state.deliveryZones[i] = { ...this.state.deliveryZones[i], ...zone, id: zone.id! };
    else this.state.deliveryZones.push({ ...zone, id: uid("dz") });
    this.pushLog("Delivery", `Guardó la zona ${zone.name}`);
    this.persist();
  }
  async removeDeliveryZone(id: string) {
    this.state.deliveryZones = this.state.deliveryZones.filter((z) => z.id !== id);
    this.persist();
  }
  async getDrivers() {
    return this.state.drivers.map((d) => ({ ...d }));
  }
  async saveDriver(driver: Omit<DeliveryDriver, "id"> & { id?: string }) {
    const i = this.state.drivers.findIndex((d) => d.id === driver.id);
    if (i >= 0) this.state.drivers[i] = { ...this.state.drivers[i], ...driver, id: driver.id! };
    else this.state.drivers.push({ ...driver, id: uid("dr") });
    this.pushLog("Delivery", `Guardó al repartidor ${driver.name}`);
    this.persist();
  }
  async removeDriver(id: string) {
    this.state.drivers = this.state.drivers.filter((d) => d.id !== id);
    this.persist();
  }

  /** Vista pública para el enlace de seguimiento (sin dirección ni teléfono). */
  getDeliveryTracking(token: string): DeliveryTracking | null {
    const d = this.state.deliveries.find((x) => x.trackingToken === token);
    if (!d || token.length < 16) return null;
    return {
      tenantName: this.state.settings.name,
      code: d.code,
      status: d.status,
      etaMin: d.etaMin,
      driverName: d.status === "en_camino" || d.status === "entregado" ? d.driverName?.split(" ")[0] ?? null : null,
      createdAt: d.createdAt,
      acceptedAt: d.acceptedAt,
      readyAt: d.readyAt,
      dispatchedAt: d.dispatchedAt,
      deliveredAt: d.deliveredAt,
      cancelledAt: d.cancelledAt,
    };
  }
}
