import { useTickets } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const PRIORITY_TONE: Record<string, "neutral" | "warning" | "accent"> = {
  Alta: "warning",
  Media: "accent",
  Baja: "neutral",
};

export function Soporte() {
  const { data: tickets = [] } = useTickets();
  const open = tickets.filter((t) => t.status === "Abierto").length;

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader
        title="Soporte"
        subtitle="Tickets de los tenants"
        actions={<Badge tone={open ? "warning" : "neutral"}>{open} abiertos</Badge>}
      />
      <Card className="divide-y divide-border-soft">
        {tickets.map((t) => (
          <div key={t.id} className="flex items-center gap-4 p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{t.subject}</p>
                <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>{t.priority}</Badge>
              </div>
              <p className="text-muted text-xs">
                {t.tenant} · {t.ago}
              </p>
            </div>
            <Badge tone={t.status === "Abierto" ? "warning" : "success"}>{t.status}</Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}
