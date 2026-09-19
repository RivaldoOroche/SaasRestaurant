import type { PlatformRepo } from "./PlatformRepo";
import { MockPlatformRepo } from "./MockPlatformRepo";
import { SupabasePlatformRepo } from "./SupabasePlatformRepo";
import { supabase, USE_MOCK } from "@/lib/supabase";

let instance: PlatformRepo | null = null;

export function getPlatformRepo(): PlatformRepo {
  if (instance) return instance;
  instance = USE_MOCK || !supabase ? new MockPlatformRepo() : new SupabasePlatformRepo(supabase);
  return instance;
}

export type { PlatformRepo } from "./PlatformRepo";
