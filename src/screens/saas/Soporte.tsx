import { useTickets, usePlatformActions } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const PRIORITY_TONE: Record<string, "neutral" | "warning" | "accent"> = {
  Alta: "warning",
  Media: "accent",
  Baja: "neutral",
};
const STATUSES = ["Abierto", "En proceso", "Resuelto"];
const PRIORITIES = ["Alta", "Media", "Baja"];

export function Soporte() {
  const { data: tickets = [] } = useTickets();
  const { updateTicket } = usePlatformActions();
  const open = tickets.filter((t) => t.status !== "Resuelto").length;

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader
        title="Soporte"
        subtitle="Tickets de los tenants · cambia estado y prioridad"
        actions={<Badge tone={open ? "warning" : "neutral"}>{open} abiertos</Badge>}
      />
      <Card className="divide-y divide-border-soft">
        {tickets.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex-1 min-w-[12rem]">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{t.subject}</p>
                <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>{t.priority}</Badge>
              </div>
              <p className="text-muted text-xs">
                {t.tenant} · {t.ago}
              </p>
            </div>

            <select
              value={t.priority}
              onChange={(e) => updateTicket.mutate({ id: t.id, patch: { priority: e.target.value } })}
              className="rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm"
              title="Prioridad"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={t.status}
              onChange={(e) => updateTicket.mutate({ id: t.id, patch: { status: e.target.value } })}
              className="rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm"
              title="Estado"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <Badge tone={t.status === "Resuelto" ? "success" : t.status === "En proceso" ? "accent" : "warning"}>
              {t.status}
            </Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}
