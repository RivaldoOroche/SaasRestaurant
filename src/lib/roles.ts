/**
 * Roles and screen access. A single source of truth for nav + gating, replacing
 * the prototype's navConfig[].roles. `saas` sees only the platform console;
 * tenant roles (dueno/admin/mesero) see the POS with escalating access.
 */
export type Role = "saas" | "dueno" | "admin" | "mesero";

export interface RoleInfo {
  id: Role;
  label: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  saas: "Dueño de la plataforma",
  dueno: "Dueña",
  admin: "Gerente",
  mesero: "Mesero",
};

/** A navigable screen, its route, icon (emoji placeholder for Phase 0), and the roles that may see it. */
export interface NavEntry {
  key: string;
  label: string;
  path: string;
  icon: string;
  roles: Role[];
  /** Where the entry lives in the rail. */
  section: "top" | "bottom";
}

const TENANT_ROLES: Role[] = ["dueno", "admin", "mesero"];
const MANAGER_UP: Role[] = ["dueno", "admin"];
const OWNER_ONLY: Role[] = ["dueno"];

/** Tenant-facing POS navigation. */
export const TENANT_NAV: NavEntry[] = [
  { key: "pedido", label: "Pedido", path: "/pos/pedido", icon: "🧾", roles: TENANT_ROLES, section: "top" },
  { key: "mesas", label: "Mesas", path: "/pos/mesas", icon: "🍽️", roles: TENANT_ROLES, section: "top" },
  { key: "cuentas", label: "Cuentas", path: "/pos/cuentas", icon: "📑", roles: TENANT_ROLES, section: "top" },
  { key: "cocina", label: "Cocina", path: "/pos/cocina", icon: "👨‍🍳", roles: TENANT_ROLES, section: "top" },
  { key: "online", label: "En línea", path: "/pos/online", icon: "🛵", roles: TENANT_ROLES, section: "top" },
  { key: "carta", label: "Carta", path: "/pos/carta", icon: "📖", roles: TENANT_ROLES, section: "top" },
  { key: "editor", label: "Editor", path: "/pos/editor", icon: "✏️", roles: MANAGER_UP, section: "top" },
  { key: "inventario", label: "Inventario", path: "/pos/inventario", icon: "📦", roles: MANAGER_UP, section: "top" },
  { key: "clientes", label: "Clientes", path: "/pos/clientes", icon: "🧑‍🤝‍🧑", roles: TENANT_ROLES, section: "top" },
  { key: "comprobantes", label: "SUNAT", path: "/pos/sunat", icon: "🧾", roles: MANAGER_UP, section: "top" },
  { key: "caja", label: "Caja", path: "/pos/caja", icon: "💵", roles: MANAGER_UP, section: "top" },
  { key: "reportes", label: "Reportes", path: "/pos/reportes", icon: "📊", roles: TENANT_ROLES, section: "top" },
  { key: "sucursales", label: "Dueño", path: "/pos/sucursales", icon: "🏢", roles: OWNER_ONLY, section: "top" },
  { key: "suscripcion", label: "Plan", path: "/pos/plan", icon: "💳", roles: OWNER_ONLY, section: "top" },
  { key: "panel", label: "Panel", path: "/pos/panel", icon: "📌", roles: MANAGER_UP, section: "top" },
  { key: "ajustes", label: "Ajustes", path: "/pos/ajustes", icon: "⚙️", roles: MANAGER_UP, section: "bottom" },
];

/** SaaS platform console navigation (saas role only). */
export const SAAS_NAV: NavEntry[] = [
  { key: "saashome", label: "Resumen", path: "/saas/resumen", icon: "🛰️", roles: ["saas"], section: "top" },
  { key: "tenants", label: "Tenants", path: "/saas/tenants", icon: "🏬", roles: ["saas"], section: "top" },
  { key: "retencion", label: "Retención", path: "/saas/retencion", icon: "📉", roles: ["saas"], section: "top" },
  { key: "ingresos", label: "Ingresos", path: "/saas/ingresos", icon: "💰", roles: ["saas"], section: "top" },
  { key: "planes", label: "Planes", path: "/saas/planes", icon: "🧩", roles: ["saas"], section: "top" },
  { key: "soporte", label: "Soporte", path: "/saas/soporte", icon: "🎧", roles: ["saas"], section: "top" },
];

export function navForRole(role: Role): NavEntry[] {
  const all = role === "saas" ? SAAS_NAV : TENANT_NAV;
  return all.filter((e) => e.roles.includes(role));
}

export function isAdmin(role: Role): boolean {
  return role === "admin" || role === "dueno";
}

export function homePathForRole(role: Role): string {
  return navForRole(role)[0]?.path ?? "/login";
}

export function canAccess(role: Role, path: string): boolean {
  return navForRole(role).some((e) => e.path === path);
}
