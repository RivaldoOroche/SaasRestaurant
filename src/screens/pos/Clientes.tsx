import { useCustomers } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";

const TIER_TONE: Record<string, "accent" | "success" | "warning" | "neutral"> = {
  Platino: "accent",
  Oro: "warning",
  Plata: "neutral",
  Bronce: "neutral",
};

export function Clientes() {
  const { data: customers = [] } = useCustomers();

  return (
    <div className="p-6 mob:p-4 max-w-4xl">
      <ScreenHeader title="Clientes" subtitle="CRM y lealtad · visitas, gasto y puntos" />
      <Card>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 text-xs uppercase tracking-wide text-muted border-b border-border">
          <span>Cliente</span>
          <span className="text-right">Visitas</span>
          <span className="text-right">Gasto</span>
          <span className="text-right">Puntos</span>
        </div>
        {customers.map((c) => (
          <div
            key={c.id}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-4 py-3 border-b border-border-soft last:border-0"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{c.name}</p>
                <Badge tone={TIER_TONE[c.tier] ?? "neutral"}>{c.tier}</Badge>
              </div>
              <p className="text-muted text-xs">{c.phone}</p>
            </div>
            <span className="text-right font-mono text-sm">{c.visits}</span>
            <span className="text-right font-mono text-sm">{formatMoney(c.spent)}</span>
            <span className="text-right font-mono text-sm text-accent">{c.points}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
