import type { Repo } from "./Repo";
import { MockRepo } from "./mock/MockRepo";
import { SupabaseRepo } from "./supabase/SupabaseRepo";
import { supabase, USE_MOCK } from "@/lib/supabase";

let mockSingleton: MockRepo | null = null;
const supabaseCache = new Map<string, SupabaseRepo>();

/** Returns the repo for the current tenant. MockRepo is shared; SupabaseRepo is per-tenant. */
export function getRepo(tenantId: string | null): Repo {
  if (USE_MOCK || !supabase || !tenantId) {
    mockSingleton ??= new MockRepo();
    return mockSingleton;
  }
  let repo = supabaseCache.get(tenantId);
  if (!repo) {
    repo = new SupabaseRepo(supabase, tenantId);
    supabaseCache.set(tenantId, repo);
  }
  return repo;
}

export type { Repo } from "./Repo";
