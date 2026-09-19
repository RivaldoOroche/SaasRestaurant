import { useMenuChanges, useTenantActions } from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const KIND_LABEL: Record<string, string> = {
  precio: "Precio",
  nuevo: "Nuevo platillo",
  "86": "Agotado / 86",
  descripcion: "Descripción",
};

export function Carta() {
  const { data: changes = [] } = useMenuChanges();
  const { reviewChange } = useTenantActions();
  const { session } = useAuth();
  const actor = session?.staff?.name ?? "Encargado";

  const pending = changes.filter((c) => c.status === "pendiente");

  return (
    <div className="p-6 max-w-3xl">
      <ScreenHeader
        title="Carta"
        subtitle="Revisión de cambios propuestos · aprueba o rechaza"
        actions={<Badge tone={pending.length ? "warning" : "neutral"}>{pending.length} pendientes</Badge>}
      />
      <div className="space-y-2">
        {changes.map((c) => (
          <Card key={c.id} className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{c.itemName}</p>
                <Badge tone="accent">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
              </div>
              <p className="text-muted text-sm mt-0.5">{c.detail}</p>
            </div>
            {c.status === "pendiente" ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => reviewChange.mutate({ id: c.id, approve: false, actor })}
                >
                  Rechazar
                </Button>
                <Button size="sm" onClick={() => reviewChange.mutate({ id: c.id, approve: true, actor })}>
                  Aprobar
                </Button>
              </div>
            ) : (
              <Badge tone={c.status === "aprobado" ? "success" : "neutral"}>
                {c.status === "aprobado" ? "Aprobado" : "Rechazado"}
              </Badge>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
