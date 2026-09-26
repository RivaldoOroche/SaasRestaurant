import { useState } from "react";
import { useMenuItems, useTenantActions, useInventory, useRecipes } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/money";
import type { InventoryItem, MenuItem, RecipeLine } from "@/data/model";

export function Editor() {
  const { data: items = [] } = useMenuItems();
  const { data: inventory = [] } = useInventory();
  const { data: recipes = {} } = useRecipes();
  const { setMenuPrice, setMenuAvailable } = useTenantActions();
  const [recipeFor, setRecipeFor] = useState<MenuItem | null>(null);

  function foodCost(itemId: string): number {
    const lines = recipes[itemId] ?? [];
    let c = 0;
    for (const l of lines) {
      const inv = inventory.find((i) => i.id === l.inventoryId);
      c += (inv?.cost ?? 0) * l.qtyPerUnit;
    }
    return Math.round(c * 100) / 100;
  }

  return (
    <div className="p-6 mob:p-4 max-w-3xl">
      <ScreenHeader title="Editor de carta" subtitle="Precios, disponibilidad (86) y recetas / food cost" />
      <Card className="divide-y divide-border">
        {items.map((it) => {
          const cost = foodCost(it.id);
          const hasRecipe = (recipes[it.id]?.length ?? 0) > 0;
          const margin = it.price > 0 && hasRecipe ? Math.round(((it.price - cost) / it.price) * 100) : null;
          return (
            <div key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <span className="text-xl">{it.emoji}</span>
              <div className="flex-1 min-w-[10rem]">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{it.name}</p>
                  {!it.available && <Badge tone="warning">86</Badge>}
                </div>
                <p className="text-muted text-xs">
                  {hasRecipe ? (
                    <>Costo {formatMoney(cost)}{margin != null && <> · margen {margin}%</>}</>
                  ) : (
                    "Sin receta"
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
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
              <Button size="sm" variant="secondary" onClick={() => setRecipeFor(it)}>
                Receta
              </Button>
              <Button
                size="sm"
                variant={it.available ? "danger" : "secondary"}
                onClick={() => setMenuAvailable.mutate({ itemId: it.id, available: !it.available })}
              >
                {it.available ? "Marcar 86" : "Activar"}
              </Button>
              </div>
            </div>
          );
        })}
      </Card>

      {recipeFor && (
        <RecipeModal
          item={recipeFor}
          inventory={inventory}
          initial={recipes[recipeFor.id] ?? []}
          onClose={() => setRecipeFor(null)}
        />
      )}
    </div>
  );
}

function RecipeModal({
  item,
  inventory,
  initial,
  onClose,
}: {
  item: MenuItem;
  inventory: InventoryItem[];
  initial: RecipeLine[];
  onClose: () => void;
}) {
  const { setRecipe } = useTenantActions();
  const [lines, setLines] = useState<RecipeLine[]>(initial.map((l) => ({ ...l })));

  const cost = lines.reduce((c, l) => c + (inventory.find((i) => i.id === l.inventoryId)?.cost ?? 0) * l.qtyPerUnit, 0);
  const costR = Math.round(cost * 100) / 100;
  const margin = item.price > 0 ? Math.round(((item.price - costR) / item.price) * 100) : 0;
  const available = inventory.filter((i) => !lines.some((l) => l.inventoryId === i.id));

  function addLine() {
    const inv = available[0];
    if (!inv) return;
    setLines([...lines, { inventoryId: inv.id, qtyPerUnit: 0.1 }]);
  }

  return (
    <Modal open onClose={onClose} labelledBy="rec-title" className="max-w-lg">
      <div className="p-5">
        <h2 id="rec-title" className="text-lg font-bold mb-1">
          Receta · {item.name}
        </h2>
        <p className="text-muted text-sm mb-4">Insumos consumidos por unidad vendida.</p>

        <div className="space-y-2 mb-3">
          {lines.length === 0 && <p className="text-muted text-sm">Sin insumos. Agrega el primero.</p>}
          {lines.map((l, idx) => {
            const inv = inventory.find((i) => i.id === l.inventoryId);
            return (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={l.inventoryId}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...l, inventoryId: e.target.value };
                    setLines(next);
                  }}
                  className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm"
                >
                  {inventory.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={l.qtyPerUnit}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...l, qtyPerUnit: Math.max(0, Number(e.target.value) || 0) };
                    setLines(next);
                  }}
                  className="w-24 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm font-mono"
                />
                <span className="w-14 text-right text-xs text-muted">{inv?.unit ?? ""}</span>
                <span className="w-20 text-right font-mono text-xs">
                  {formatMoney((inv?.cost ?? 0) * l.qtyPerUnit)}
                </span>
                <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-warning text-sm">
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <Button size="sm" variant="secondary" onClick={addLine} disabled={available.length === 0}>
          + Agregar insumo
        </Button>

        <div className="flex items-center justify-between mt-4 rounded-lg bg-surface-alt border border-border-soft p-3 text-sm">
          <span>
            Food cost <span className="font-mono font-semibold">{formatMoney(costR)}</span>
          </span>
          <span>
            Precio {formatMoney(item.price)} ·{" "}
            <span className={margin >= 60 ? "text-success" : margin >= 30 ? "text-warning" : "text-neutral"}>
              margen {margin}%
            </span>
          </span>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={setRecipe.isPending}
            onClick={() => setRecipe.mutate({ menuItemId: item.id, lines }, { onSuccess: onClose })}
          >
            Guardar receta
          </Button>
        </div>
      </div>
    </Modal>
  );
}
