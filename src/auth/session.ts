import type { Role } from "@/lib/roles";

export interface ActingStaff {
  id: string;
  name: string;
  initials: string;
  role: Role;
}

export interface Session {
  role: Role;
  tenantId: string | null;
  tenantName: string | null;
  staff: ActingStaff | null;
  userEmail: string | null;
  /** True when a platform admin has entered a tenant's POS. */
  impersonating: boolean;
}

/**
 * Mock users for demo / offline UI work (mirrors the prototype's PIN table).
 * Each PIN maps to a *distinct* identity — fixing the prototype bug where two
 * waiters shared one role identity.
 */
export interface MockUser {
  pin: string;
  name: string;
  initials: string;
  role: Role;
  tenantId: string;
  tenantName: string;
}

export const MOCK_TENANT_ID = "11111111-1111-1111-1111-111111111111";

export const MOCK_USERS: MockUser[] = [
  { pin: "0000", name: "Tú (SaaS)", initials: "SA", role: "saas", tenantId: "", tenantName: "NubePOS" },
  { pin: "1111", name: "Mónica R.", initials: "MR", role: "dueno", tenantId: MOCK_TENANT_ID, tenantName: "La Higuera" },
  { pin: "2222", name: "Iker Solís", initials: "IS", role: "admin", tenantId: MOCK_TENANT_ID, tenantName: "La Higuera" },
  { pin: "3333", name: "Ana Ruiz", initials: "AR", role: "mesero", tenantId: MOCK_TENANT_ID, tenantName: "La Higuera" },
  { pin: "4444", name: "Carlos Vega", initials: "CV", role: "mesero", tenantId: MOCK_TENANT_ID, tenantName: "La Higuera" },
];

export function sessionFromMockUser(u: MockUser): Session {
  return {
    role: u.role,
    tenantId: u.tenantId || null,
    tenantName: u.tenantName,
    staff: { id: u.pin, name: u.name, initials: u.initials, role: u.role },
    userEmail: null,
    impersonating: false,
  };
}

const KEY = "nubepos-session-v1";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
