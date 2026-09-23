import { TENANT_NAV, type Role } from "./roles";

/** Roles a los que se les puede personalizar el acceso (el dueño siempre tiene todo). */
export const EDITABLE_ROLES: Role[] = ["admin", "mesero"];

/** Catálogo de permisos = pantallas que algún rol editable puede llegar a tener. */
export function permissionCatalog(): { key: string; label: string }[] {
  return TENANT_NAV.filter((e) => e.roles.some((r) => (EDITABLE_ROLES as string[]).includes(r))).map((e) => ({
    key: e.key,
    label: e.label,
  }));
}

/** Acceso por defecto de un rol: las pantallas que su rol trae de fábrica. */
export function defaultPermissions(role: Role): string[] {
  return TENANT_NAV.filter((e) => e.roles.includes(role)).map((e) => e.key);
}

/**
 * Permisos efectivos de un rol = override del tenant si existe, si no los de
 * fábrica. El dueño siempre tiene acceso a todo.
 */
export function effectivePermissions(role: Role, overrides: Record<string, string[]>): Set<string> {
  if (role === "dueno" || role === "saas") return new Set(TENANT_NAV.map((e) => e.key));
  return new Set(overrides[role] ?? defaultPermissions(role));
}
