import { useInventory, useTenantActions } from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { InventoryItem, InventoryStatus } from "@/data/model";

function statusOf(i: InventoryItem): InventoryStatus {
  if (i.stock <= 0) return "agotado";
  if (i.stock < i.par * 0.4) return "bajo";
  return "ok";
}

const TONE = { ok: "success", bajo: "warning", agotado: "neutral" } as const;
const LABEL = { ok: "En nivel", bajo: "Stock bajo", agotado: "Agotado" };

export function Inventario() {
  const { data: items = [] } = useInventory();
  const { adjustInventory } = useTenantActions();
  const { session } = useAuth();
  const actor = session?.staff?.name ?? "Admin";

  const low = items.filter((i) => statusOf(i) === "bajo").length;
  const out = items.filter((i) => statusOf(i) === "agotado").length;

  return (
    <div className="p-6 mob:p-4 max-w-4xl">
      <ScreenHeader
        title="Inventario"
        subtitle="Control de stock por insumo · ajusta con ± (solo admin)"
        actions={
          <div className="flex gap-4 text-sm">
            <Stat label="Insumos" value={items.length} />
            <Stat label="Stock bajo" value={low} tone={low ? "warning" : undefined} />
            <Stat label="Agotados" value={out} tone={out ? "neutral" : undefined} />
          </div>
        }
      />
      <Card className="divide-y divide-border">
        {items.map((i) => {
          const st = statusOf(i);
          const pct = Math.min(100, Math.round((i.stock / Math.max(i.par, 1)) * 100));
          return (
            <div key={i.id} className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{i.name}</p>
                  <Badge tone={TONE[st]}>{LABEL[st]}</Badge>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-chip-bg overflow-hidden max-w-xs">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      st === "ok" ? "bg-success" : st === "bajo" ? "bg-warning" : "bg-neutral",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-muted text-xs mt-1">
                  {i.stock} / {i.par} {i.unit} (par)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <AdjBtn onClick={() => adjustInventory.mutate({ itemId: i.id, delta: -1, actor })}>−</AdjBtn>
                <AdjBtn onClick={() => adjustInventory.mutate({ itemId: i.id, delta: 1, actor })}>+</AdjBtn>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function AdjBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="h-9 w-9 rounded-md bg-chip-bg border border-border grid place-items-center">
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warning" | "neutral" }) {
  return (
    <div className="text-center">
      <p className={cn("text-lg font-bold", tone === "warning" && "text-warning", tone === "neutral" && "text-neutral")}>
        {value}
      </p>
      <p className="text-muted text-xs">{label}</p>
    </div>
  );
}
