// Motor de sincronización offline-first del POS.
//
//   vista = estado del servidor (base) + operaciones confirmadas aún no
//           reflejadas en la base (acked) + operaciones en cola (pending)
//
// · Cada acción se aplica al instante en la vista (la pantalla no espera red).
// · Con internet se envía enseguida; sin internet queda en la cola, guardada
//   en el dispositivo (IndexedDB), y se envía sola al volver la conexión.
// · El servidor aplica cada operación una sola vez (pos_ops), así que
//   reenviar tras un corte nunca duplica ventas.
// · Si el servidor rechaza una operación en segundo plano (p. ej. la mesa ya
//   la cobró otro dispositivo), queda en "rechazadas" para que el usuario la vea.
// · La base se refresca con cambios incrementales (Realtime + sondeo de respaldo).
import { applyOp, OpError, type ReduceCtx } from "../pos/reduce";
import { emptyPosState, type OpResult, type PosOp, type PosSnapshot, type PosState } from "../pos/ops";
import type { DeliveryDriver, DeliveryZone } from "../model";
import type { KV } from "./kv";
import { breadcrumb, captureWarning } from "@/lib/observability";

export interface PosBackend {
  /** Estado completo (since = null) o cambios desde `since` (hora del servidor). */
  snapshot(since: string | null): Promise<PosSnapshot>;
  /** Aplica un lote de operaciones en orden; una respuesta por operación. */
  apply(ops: PosOp[]): Promise<OpResult[]>;
}

export interface RejectedOp {
  op: PosOp;
  error: string;
  at: string;
}

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number;
  rejected: RejectedOp[];
  lastSyncAt: string | null;
  lastError: string | null;
  ready: boolean;
}

interface Persisted {
  base: PosState;
  serverTime: string | null;
  pending: PosOp[];
  acked: { op: PosOp; ackedAt: number }[];
  rejected: RejectedOp[];
  aliases: [string, string][];
}

export interface EngineOptions {
  backend: PosBackend;
  kv: KV;
  /** Clave de almacenamiento (una por tenant). */
  key: string;
  isOnline: () => boolean;
  /** Catálogo necesario para validar delivery en la vista. */
  catalog: () => { zones: DeliveryZone[]; drivers: DeliveryDriver[] };
  /** Espera máxima de la confirmación del servidor antes de seguir en modo optimista. */
  submitTimeoutMs?: number;
  /** Operaciones que el servidor acaba de confirmar (tras un envío). */
  onAcked?: (ops: PosOp[]) => void;
}

const OVERLAP_MS = 30_000; // solapamiento del delta: cubre transacciones que confirmaron tarde
const BATCH = 100;

const OPEN = (s: string) => s !== "cobrada" && s !== "anulada";

/** Integra una respuesta del servidor en la base local. */
export function mergeSnapshot(base: PosState, snap: PosSnapshot): PosState {
  if (snap.full) {
    return {
      tables: snap.tables,
      orders: snap.orders.filter((o) => OPEN(o.status)),
      tickets: snap.tickets.filter((k) => k.col !== "entregado"),
      deliveries: snap.deliveries,
      cash: (snap.cash ?? []).filter((c) => c.status === "abierta"),
    };
  }
  const upsert = <T extends { id: string }>(list: T[], changed: T[]) => {
    if (!changed.length) return list;
    const byId = new Map(changed.map((x) => [x.id, x]));
    const out = list.map((x) => byId.get(x.id) ?? x);
    for (const x of changed) if (!list.some((y) => y.id === x.id)) out.push(x);
    return out;
  };
  let tables = upsert(base.tables, snap.tables);
  if (snap.tableIds) {
    const alive = new Set(snap.tableIds);
    tables = tables.filter((t) => alive.has(t.id));
  }
  return {
    tables: tables.sort((a, b) => a.number - b.number),
    orders: upsert(base.orders, snap.orders).filter((o) => OPEN(o.status)),
    tickets: upsert(base.tickets, snap.tickets).filter((k) => k.col !== "entregado"),
    deliveries: upsert(base.deliveries, snap.deliveries),
    cash: upsert(base.cash ?? [], snap.cash ?? []).filter((c) => c.status === "abierta"),
  };
}

export class SyncEngine {
  private base: PosState = emptyPosState();
  private serverTime: string | null = null;
  private pending: PosOp[] = [];
  private acked: { op: PosOp; ackedAt: number }[] = [];
  private rejected: RejectedOp[] = [];
  private aliases = new Map<string, string>();
  private results = new Map<string, OpResult>();

  private cachedView: PosState | null = null;
  private listeners = new Set<() => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private loaded: Promise<void> | null = null;
  private status: SyncStatus = {
    online: true,
    syncing: false,
    pending: 0,
    rejected: [],
    lastSyncAt: null,
    lastError: null,
    ready: false,
  };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 2000;

  constructor(private o: EngineOptions) {}

  // ---- Ciclo de vida ------------------------------------------------------
  /** Carga lo guardado en el dispositivo y, si hay red, trae el estado del servidor. */
  ready(): Promise<void> {
    this.loaded ??= (async () => {
      const saved = await this.o.kv.get<Persisted>(this.o.key);
      if (saved) {
        this.base = saved.base;
        this.serverTime = saved.serverTime;
        this.pending = saved.pending ?? [];
        this.acked = saved.acked ?? [];
        this.rejected = saved.rejected ?? [];
        this.aliases = new Map(saved.aliases ?? []);
      }
      this.status.ready = true;
      this.changed();
      if (this.o.isOnline()) {
        // Sin copia local hay que esperar al servidor; con copia, se muestra ya y se actualiza detrás.
        const first = this.pending.length ? this.flush() : this.pull(true);
        if (!saved) await first.catch(() => undefined);
      }
    })();
    return this.loaded;
  }

  /** Reintenta al volver la red o la pestaña; sondeo de respaldo por si Realtime se corta. */
  start(): () => void {
    const kick = () => void this.flush().then(() => this.pull());
    const onVisible = () => document.visibilityState === "visible" && kick();
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    const delta = setInterval(() => document.visibilityState === "visible" && void this.pull(), 60_000);
    const full = setInterval(() => void this.pull(true), 15 * 60_000);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(delta);
      clearInterval(full);
    };
  }

  /** La conectividad cambió (evento del navegador o modo sin conexión simulado). */
  connectivityChanged() {
    this.changed();
    if (this.o.isOnline()) void this.flush().then(() => this.pull());
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  /** Estado operativo que ve la pantalla. */
  view(): PosState {
    if (this.cachedView) return this.cachedView;
    const draft = structuredClone(this.base);
    const ctx = this.ctx();
    for (const { op } of this.acked) {
      try {
        applyOp(draft, op, ctx);
      } catch {
        /* ya reflejada en la base, o superada por otro dispositivo */
      }
    }
    for (const op of this.pending) {
      try {
        applyOp(draft, op, ctx);
      } catch {
        /* el servidor decidirá; se verá como rechazada si corresponde */
      }
    }
    this.cachedView = draft;
    return draft;
  }

  /** Operaciones en cola (para superponer inventario / comprobantes locales). */
  pendingOps(): PosOp[] {
    return [...this.acked.map((a) => a.op), ...this.pending];
  }

  resolveOrderId(id: string): string {
    return this.aliases.get(id) ?? id;
  }

  // ---- Operaciones --------------------------------------------------------
  /**
   * Aplica una operación: la valida contra la vista, la muestra al instante y
   * la envía. Con conexión espera la respuesta (hasta submitTimeoutMs) para
   * mostrar un rechazo al momento; sin conexión, queda en cola y resuelve ya.
   */
  async submit(op: PosOp): Promise<Record<string, unknown>> {
    await this.ready();
    const local = applyOp(structuredClone(this.view()), op, this.ctx()); // lanza OpError si no procede
    this.pending.push(op);
    this.changed();
    await this.persist();
    if (!this.o.isOnline()) return local;

    const sent = this.flush().then(() => this.results.get(op.id));
    const timeout = new Promise<undefined>((r) => setTimeout(() => r(undefined), this.o.submitTimeoutMs ?? 8000));
    const res = await Promise.race([sent, timeout]);
    if (res?.status === "error") {
      // El usuario está mirando: se le muestra el error en vez de dejarlo en "rechazadas".
      this.rejected = this.rejected.filter((r) => r.op.id !== op.id);
      this.changed();
      await this.persist();
      throw new OpError(res.error ?? "El servidor rechazó la operación.");
    }
    return res?.result ?? local;
  }

  dismissRejected(opId?: string) {
    this.rejected = opId ? this.rejected.filter((r) => r.op.id !== opId) : [];
    this.changed();
    void this.persist();
  }

  // ---- Red ----------------------------------------------------------------
  /** Envía la cola al servidor (serializado: nunca dos envíos a la vez). */
  flush(): Promise<void> {
    return this.serial(async () => {
      if (!this.pending.length || !this.o.isOnline()) return;
      this.setSyncing(true);
      let sentAny = false;
      const ackedNow: PosOp[] = [];
      try {
        while (this.pending.length) {
          const batch = this.pending.slice(0, BATCH).map((op) => this.rewrite(op));
          const res = await this.o.backend.apply(batch);
          const now = Date.now();
          const byId = new Map(res.map((r) => [r.id, r]));
          for (const op of batch) {
            const r = byId.get(op.id);
            if (!r) continue;
            this.results.set(op.id, r);
            if (r.status === "ok") {
              this.acked.push({ op, ackedAt: now });
              ackedNow.push(op);
              const target = r.result?.order_id;
              if (op.type === "order.open" && typeof target === "string" && target !== op.order_id) {
                this.aliases.set(op.order_id, target);
              }
            } else {
              this.rejected.push({ op, error: r.error ?? "Rechazada", at: new Date().toISOString() });
              captureWarning(`Operación rechazada: ${op.type}`, { error: r.error, queuedAt: op.at });
            }
          }
          const done = new Set(batch.map((op) => op.id));
          this.pending = this.pending.filter((op) => !done.has(op.id));
          sentAny = true;
          this.changed();
          await this.persist();
        }
        this.networkOk();
      } catch (e) {
        this.networkFailed(e);
      } finally {
        this.setSyncing(false);
      }
      if (sentAny) await this.pullNow(false);
      if (ackedNow.length) this.o.onAcked?.(ackedNow);
    });
  }

  /** Trae del servidor el estado (incremental salvo `full`). */
  pull(full = false): Promise<void> {
    return this.serial(() => this.pullNow(full));
  }

  private async pullNow(full: boolean) {
    if (!this.o.isOnline()) return;
    const startedAt = Date.now();
    const since =
      full || !this.serverTime ? null : new Date(new Date(this.serverTime).getTime() - OVERLAP_MS).toISOString();
    try {
      const snap = await this.o.backend.snapshot(since);
      this.base = mergeSnapshot(this.base, snap);
      this.serverTime = snap.serverTime;
      // Lo confirmado antes de esta lectura ya está en la base.
      this.acked = this.acked.filter((a) => a.ackedAt > startedAt);
      this.status.lastSyncAt = new Date().toISOString();
      this.networkOk();
      this.changed();
      await this.persist();
    } catch (e) {
      this.networkFailed(e);
    }
  }

  /** Reintento automático con espera creciente (2 s → 60 s) mientras falle la red. */
  private networkFailed(e: unknown) {
    this.status.lastError = (e as Error)?.message ?? String(e);
    if (this.status.online) breadcrumb("sync", "Sin conexión con el servidor", { pending: this.pending.length });
    this.status.online = false;
    this.changed();
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush().then(() => this.pull());
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
  }

  private networkOk() {
    this.retryDelay = 2000;
    if (!this.status.online || this.status.lastError) {
      breadcrumb("sync", "Conexión recuperada", { pending: this.pending.length });
      this.status.online = true;
      this.status.lastError = null;
      this.changed();
    }
  }

  // ---- Internos -----------------------------------------------------------
  private ctx(): ReduceCtx {
    const { zones, drivers } = this.o.catalog();
    return { zones, drivers, aliases: this.aliases };
  }

  /** Reescribe ids de pedidos redirigidos antes de enviarlos. */
  private rewrite(op: PosOp): PosOp {
    if ("order_id" in op && op.type !== "order.open" && op.type !== "delivery.create" && op.order_id) {
      const to = this.aliases.get(op.order_id);
      if (to) return { ...op, order_id: to } as PosOp;
    }
    return op;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private setSyncing(v: boolean) {
    this.status.syncing = v;
    this.changed();
  }

  private changed() {
    this.cachedView = null;
    this.status = {
      ...this.status,
      pending: this.pending.length,
      rejected: this.rejected,
      online: this.o.isOnline() && this.status.online,
    };
    for (const l of this.listeners) l();
  }

  private persist(): Promise<void> {
    const data: Persisted = {
      base: this.base,
      serverTime: this.serverTime,
      pending: this.pending,
      acked: this.acked,
      rejected: this.rejected,
      aliases: [...this.aliases],
    };
    return this.o.kv.set(this.o.key, data).catch(() => undefined);
  }
}
