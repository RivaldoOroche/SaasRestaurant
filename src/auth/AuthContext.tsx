import { createContext, useContext } from "react";
import type { Session } from "./session";
import type { Role } from "@/lib/roles";

export interface AuthValue {
  session: Session | null;
  ready: boolean;
  /** Mock/PIN login (works offline). Returns null on success, or an error message. */
  loginWithPin: (pin: string) => Promise<string | null>;
  /** Real Supabase owner login (email + password). */
  loginWithPassword: (email: string, password: string) => Promise<string | null>;
  /** Platform admin enters a tenant's POS (audited impersonation). */
  enterTenant: (tenantId: string, tenantName: string) => void;
  /** Return from impersonation to the platform console. */
  exitTenant: () => void;
  /** Lock the session and return to the PIN screen. */
  lock: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function useRole(): Role | null {
  return useAuth().session?.role ?? null;
}
