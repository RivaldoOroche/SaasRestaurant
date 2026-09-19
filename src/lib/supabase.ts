import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

/**
 * The browser client. Null when env vars are missing or mock mode is on, so the
 * UI can render against local mock data before the backend is provisioned.
 */
export const supabase: SupabaseClient<Database> | null =
  !USE_MOCK && url && anonKey ? createClient<Database>(url, anonKey) : null;

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      "Supabase no está configurado. Copia .env.example a .env y define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
}

export const isBackendConfigured = Boolean(supabase);
