import { useRolePermissions, usePermissionActions } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { permissionCatalog, defaultPermissions, EDITABLE_ROLES } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/roles";

const ROLE_LABEL: Record<string, string> = { admin: "Gerente", mesero: "Mesero" };

export function Permisos() {
  const { data: overrides = {} } = useRolePermissions();
  const { setRolePermissions } = usePermissionActions();
  const catalog = permissionCatalog();

  function toggle(role: Role, key: string, on: boolean) {
    const current = new Set(overrides[role] ?? defaultPermissions(role));
    if (on) current.add(key);
    else current.delete(key);
    setRolePermissions.mutate({ role, screens: [...current] });
  }

  return (
    <div className="p-6 mob:p-4 max-w-3xl">
      <ScreenHeader
        title="Permisos por rol"
        subtitle="Elige a qué pantallas accede cada rol. El Dueño siempre tiene acceso completo."
      />
      <Card>
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs uppercase tracking-wide">
                <th className="text-left font-medium py-2">Pantalla</th>
                {EDITABLE_ROLES.map((r) => (
                  <th key={r} className="text-center font-medium py-2 px-3">
                    {ROLE_LABEL[r] ?? r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog.map((c) => (
                <tr key={c.key} className="border-t border-border-soft">
                  <td className="py-2">{c.label}</td>
                  {EDITABLE_ROLES.map((r) => {
                    const allowed = new Set(overrides[r] ?? defaultPermissions(r));
                    const on = allowed.has(c.key);
                    return (
                      <td key={r} className="text-center px-3">
                        <button
                          onClick={() => toggle(r, c.key, !on)}
                          disabled={setRolePermissions.isPending}
                          className={cn(
                            "h-6 w-11 rounded-full relative transition-colors",
                            on ? "bg-accent" : "bg-chip-bg border border-border",
                          )}
                          title={on ? "Permitido" : "Bloqueado"}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                              on ? "left-[22px]" : "left-0.5",
                            )}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted text-xs mt-3">
            Los cambios aplican de inmediato: cada rol solo verá en su menú las pantallas permitidas.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
