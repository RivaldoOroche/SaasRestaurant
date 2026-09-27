import type { Repo, BackendRepo } from "./Repo";
import { MockRepo } from "./mock/MockRepo";
import { SupabaseRepo } from "./supabase/SupabaseRepo";
import { createRepo } from "./sync/PosService";
import { defaultKV, type KV } from "./sync/kv";
import { supabase, USE_MOCK } from "@/lib/supabase";
import { isOnlineNow, useConnection } from "@/store/connection";

const cache = new Map<string, Repo>();

/** Repo offline-first sobre un backend: operaciones en cola + lecturas con respaldo local. */
export function composeRepo(backend: BackendRepo, tenantKey: string, kv: KV = defaultKV()): Repo {
  return createRepo(backend, {
    kv,
    tenantKey,
    isOnline: isOnlineNow,
    onConnectivity: (cb) => {
      let last = isOnlineNow();
      return useConnection.subscribe((s) => {
        if (s.online !== last) {
          last = s.online;
          cb();
        }
      });
    },
  });
}

/** Repo del tenant actual (demo en el navegador o Supabase). Uno por tenant. */
export function getRepo(tenantId: string | null): Repo {
  const mock = USE_MOCK || !supabase || !tenantId;
  const key = mock ? "demo" : tenantId!;
  let repo = cache.get(key);
  if (!repo) {
    repo = composeRepo(mock ? new MockRepo() : new SupabaseRepo(supabase!, tenantId!), key);
    cache.set(key, repo);
  }
  return repo;
}

export type { Repo } from "./Repo";
