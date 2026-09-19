import { useMenuItems, useTenantActions } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";

export function Editor() {
  const { data: items = [] } = useMenuItems();
  const { setMenuPrice, setMenuAvailable } = useTenantActions();

  return (
    <div className="p-6 max-w-3xl">
      <ScreenHeader title="Editor de carta" subtitle="Ajusta precios (±S/1) y marca 86 / activa platillos" />
      <Card className="divide-y divide-border">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-4 p-3">
            <span className="text-xl">{it.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{it.name}</p>
                {!it.available && <Badge tone="warning">86</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setMenuPrice.mutate({ itemId: it.id, price: Math.max(0, it.price - 1) })}
                className="h-8 w-8 rounded-md bg-chip-bg border border-border"
              >
                −
              </button>
              <span className="w-20 text-center font-mono text-sm">{formatMoney(it.price)}</span>
              <button
                onClick={() => setMenuPrice.mutate({ itemId: it.id, price: it.price + 1 })}
                className="h-8 w-8 rounded-md bg-chip-bg border border-border"
              >
                +
              </button>
            </div>
            <Button
              size="sm"
              variant={it.available ? "danger" : "secondary"}
              onClick={() => setMenuAvailable.mutate({ itemId: it.id, available: !it.available })}
            >
              {it.available ? "Marcar 86" : "Activar"}
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
