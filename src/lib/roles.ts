/**
 * Roles and screen access. A single source of truth for nav + gating, replacing
 * the prototype's navConfig[].roles. `saas` sees only the platform console;
 * tenant roles (dueno/admin/mesero) see the POS with escalating access.
 */
import type { BusinessType } from "./comedor";

export type Role = "saas" | "dueno" | "admin" | "mesero";

export interface RoleInfo {
  id: Role;
  label: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  saas: "Dueño de la plataforma",
  dueno: "Dueño(a)",
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
  /** Grupo con título en el menú (Servicio, Caja y ventas, Gestión). */
  group?: NavGroup;
  /** Accesible por ruta pero sin botón propio (se llega desde otra pantalla). */
  hidden?: boolean;
  /** Tipos de negocio que la ven (ausente = todos). */
  types?: BusinessType[];
}

export type NavGroup = "servicio" | "ventas" | "gestion";
export const NAV_GROUP_LABEL: Record<NavGroup, string> = { servicio: "Servicio", ventas: "Caja y ventas", gestion: "Gestión" };

const TENANT_ROLES: Role[] = ["dueno", "admin", "mesero"];
const MANAGER_UP: Role[] = ["dueno", "admin"];
const OWNER_ONLY: Role[] = ["dueno"];
const R: BusinessType[] = ["restaurante"];
const C: BusinessType[] = ["comedor"];

/** Tenant-facing POS navigation. */
export const TENANT_NAV: NavEntry[] = [
  { key: "panel", label: "Inicio", path: "/pos/panel", icon: "🏠", roles: MANAGER_UP, section: "top" },
  // Servicio: lo que se usa con el local abierto.
  { key: "mesas", label: "Mesas", path: "/pos/mesas", icon: "🍽️", roles: TENANT_ROLES, section: "top", group: "servicio", types: R },
  { key: "pedido", label: "Pedido", path: "/pos/pedido", icon: "🧾", roles: TENANT_ROLES, section: "top", group: "servicio", types: R },
  { key: "cuentas", label: "Cuentas", path: "/pos/cuentas", icon: "📑", roles: TENANT_ROLES, section: "top", group: "servicio", types: R },
  { key: "cocina", label: "Cocina", path: "/pos/cocina", icon: "👨‍🍳", roles: TENANT_ROLES, section: "top", group: "servicio", types: R },
  { key: "delivery", label: "Delivery", path: "/pos/delivery", icon: "🛵", roles: TENANT_ROLES, section: "top", group: "servicio", types: R },
  { key: "online", label: "En línea", path: "/pos/online", icon: "📱", roles: TENANT_ROLES, section: "top", group: "servicio", types: R },
  { key: "reservas", label: "Reservas", path: "/pos/reservas", icon: "📅", roles: TENANT_ROLES, section: "top", group: "servicio", types: R },
  // Comedor: despacho del menú y del kiosko, padrón con monedero y menú del día.
  { key: "despacho", label: "Despacho", path: "/pos/despacho", icon: "🍱", roles: TENANT_ROLES, section: "top", group: "servicio", types: C },
  { key: "comensales", label: "Comensales", path: "/pos/comensales", icon: "🎒", roles: TENANT_ROLES, section: "top", group: "servicio", types: C },
  { key: "menudia", label: "Menú del día", path: "/pos/menu-dia", icon: "🗓️", roles: MANAGER_UP, section: "top", group: "servicio", types: C },
  // Caja y ventas.
  { key: "caja", label: "Caja", path: "/pos/caja", icon: "💵", roles: MANAGER_UP, section: "top", group: "ventas" },
  { key: "comprobantes", label: "SUNAT", path: "/pos/sunat", icon: "🧾", roles: MANAGER_UP, section: "top", group: "ventas" },
  { key: "clientes", label: "Clientes", path: "/pos/clientes", icon: "🧑‍🤝‍🧑", roles: TENANT_ROLES, section: "top", group: "ventas", types: R },
  { key: "reportes", label: "Reportes", path: "/pos/reportes", icon: "📊", roles: TENANT_ROLES, section: "top", group: "ventas", types: R },
  { key: "comreportes", label: "Reportes", path: "/pos/comedor-reportes", icon: "📊", roles: MANAGER_UP, section: "top", group: "ventas", types: C },
  // Gestión del negocio.
  { key: "editor", label: "Carta", path: "/pos/editor", icon: "📖", roles: MANAGER_UP, section: "top", group: "gestion" },
  { key: "inventario", label: "Inventario", path: "/pos/inventario", icon: "📦", roles: MANAGER_UP, section: "top", group: "gestion" },
  { key: "personal", label: "Personal", path: "/pos/personal", icon: "👥", roles: OWNER_ONLY, section: "top", group: "gestion" },
  { key: "sucursales", label: "Sucursales", path: "/pos/sucursales", icon: "🏢", roles: OWNER_ONLY, section: "top", group: "gestion" },
  { key: "reclamaciones", label: "Reclamos", path: "/pos/reclamaciones", icon: "📕", roles: MANAGER_UP, section: "top", group: "gestion" },
  { key: "suscripcion", label: "Plan", path: "/pos/plan", icon: "💳", roles: OWNER_ONLY, section: "top", group: "gestion" },
  // Se llega desde Carta e Inicio cuando hay cambios propuestos.
  { key: "carta", label: "Aprobaciones", path: "/pos/carta", icon: "✅", roles: MANAGER_UP, section: "top", group: "gestion", hidden: true, types: R },
  { key: "permisos", label: "Permisos", path: "/pos/permisos", icon: "🔐", roles: OWNER_ONLY, section: "bottom" },
  { key: "ajustes", label: "Ajustes", path: "/pos/ajustes", icon: "⚙️", roles: MANAGER_UP, section: "bottom" },
  { key: "ayuda", label: "Ayuda", path: "/pos/ayuda", icon: "❓", roles: TENANT_ROLES, section: "bottom" },
];

/** SaaS platform console navigation (saas role only). */
export const SAAS_NAV: NavEntry[] = [
  { key: "saashome", label: "Resumen", path: "/saas/resumen", icon: "🛰️", roles: ["saas"], section: "top" },
  { key: "tenants", label: "Tenants", path: "/saas/tenants", icon: "🏬", roles: ["saas"], section: "top" },
  { key: "retencion", label: "Retención", path: "/saas/retencion", icon: "📉", roles: ["saas"], section: "top" },
  { key: "ingresos", label: "Ingresos", path: "/saas/ingresos", icon: "💰", roles: ["saas"], section: "top" },
  { key: "cobros", label: "Cobros", path: "/saas/cobros", icon: "🧾", roles: ["saas"], section: "top" },
  { key: "planes", label: "Planes", path: "/saas/planes", icon: "🧩", roles: ["saas"], section: "top" },
  { key: "soporte", label: "Soporte", path: "/saas/soporte", icon: "🎧", roles: ["saas"], section: "top" },
  { key: "bitacora", label: "Bitácora", path: "/saas/bitacora", icon: "📋", roles: ["saas"], section: "top" },
  { key: "configsaas", label: "Config", path: "/saas/config", icon: "⚙️", roles: ["saas"], section: "bottom" },
  { key: "ayuda", label: "Ayuda", path: "/saas/ayuda", icon: "❓", roles: ["saas"], section: "bottom" },
];

/** Pantallas del rol para su tipo de negocio (restaurante por defecto). */
export function navForRole(role: Role, type: BusinessType = "restaurante"): NavEntry[] {
  const all = role === "saas" ? SAAS_NAV : TENANT_NAV;
  return all.filter((e) => e.roles.includes(role) && (!e.types || e.types.includes(type)));
}

export function isAdmin(role: Role): boolean {
  return role === "admin" || role === "dueno";
}

export function homePathForRole(role: Role, type?: BusinessType): string {
  return navForRole(role, type).find((e) => !e.hidden)?.path ?? "/login";
}

export function canAccess(role: Role, path: string, type?: BusinessType): boolean {
  return navForRole(role, type).some((e) => e.path === path);
}

/** Nombre del rol según el negocio: en un comedor el «mesero» atiende el despacho. */
export function roleLabel(role: Role, type?: BusinessType): string {
  if (type === "comedor" && role === "mesero") return "Atención";
  return ROLE_LABELS[role];
}
