// Almacén clave-valor persistente para el modo sin conexión.
// IndexedDB en el navegador (sobrevive recargas y cierres, sin el límite de
// ~5 MB de localStorage); en memoria donde no existe (pruebas, SSR).

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export class MemoryKV implements KV {
  private m = new Map<string, unknown>();
  async get<T>(key: string) {
    const v = this.m.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async set(key: string, value: unknown) {
    this.m.set(key, structuredClone(value));
  }
  async del(key: string) {
    this.m.delete(key);
  }
}

const DB = "wayra-offline";
const STORE = "kv";

class IdbKV implements KV {
  private db: Promise<IDBDatabase>;
  constructor() {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  get<T>(key: string) {
    return this.tx<T | undefined>("readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
  }
  async set(key: string, value: unknown) {
    await this.tx("readwrite", (s) => s.put(value, key));
  }
  async del(key: string) {
    await this.tx("readwrite", (s) => s.delete(key));
  }
}

/** Si IndexedDB falla (modo privado de algunos navegadores), sigue en memoria. */
class SafeKV implements KV {
  private fallback = new MemoryKV();
  private broken = false;
  constructor(private inner: KV) {}
  private async run<T>(fn: (kv: KV) => Promise<T>): Promise<T> {
    if (!this.broken) {
      try {
        return await fn(this.inner);
      } catch {
        this.broken = true;
      }
    }
    return fn(this.fallback);
  }
  get<T>(key: string) {
    return this.run((kv) => kv.get<T>(key));
  }
  set(key: string, value: unknown) {
    return this.run((kv) => kv.set(key, value));
  }
  del(key: string) {
    return this.run((kv) => kv.del(key));
  }
}

let shared: KV | null = null;
export function defaultKV(): KV {
  shared ??= typeof indexedDB === "undefined" ? new MemoryKV() : new SafeKV(new IdbKV());
  return shared;
}

/** Identificador estable de este dispositivo (para terminales y auditoría). */
export function deviceId(): string {
  const KEY = "wayra-device-id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `dev-${crypto.randomUUID()}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "dev-sin-almacenamiento";
  }
}
