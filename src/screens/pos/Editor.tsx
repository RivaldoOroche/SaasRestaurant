// Constructor de carta: categorías, platos (con receta, costo y margen),
// modificadores y precio/disponibilidad por sucursal. Pensado para que el dueño
// arme su carta solo, sin ayuda: todo se crea desde aquí.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useInventory, useMenuActions, useMenuCatalog, useMenuChanges, useRecipes } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { foodCostTone, marginPct } from "@/lib/menu";
import type { Category, MenuItem } from "@/data/model";
import { ItemModal } from "./carta/ItemModal";
import { CategoryModal } from "./carta/CategoryModal";
import { ModifiersPanel } from "./carta/ModifiersPanel";

type Tab = "platos" | "modificadores";
const TONE_TEXT = { success: "text-success", warning: "text-warning", neutral: "text-muted" } as const;

export function Editor() {
  const { data: catalog, isLoading } = useMenuCatalog();
  const { data: inventory = [] } = useInventory();
  const { data: recipes = {} } = useRecipes();
  const { data: changes = [] } = useMenuChanges();
  const { reorderCategories, archiveItem } = useMenuActions();
  const [tab, setTab] = useState<Tab>("platos");
  const [catId, setCatId] = useState<string | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [editingCat, setEditingCat] = useState<Category | "new" | null>(null);
  const [q, setQ] = useState("");

  const categories = catalog?.categories ?? [];
  const items = catalog?.items ?? [];
  const overrides = catalog?.overrides ?? [];
  const pending = changes.filter((c) => c.status === "pendiente").length;

  const cost = (itemId: string) =>
    Math.round((recipes[itemId] ?? []).reduce((c, l) => c + (inventory.find((i) => i.id === l.inventoryId)?.cost ?? 0) * l.qtyPerUnit, 0) * 100) / 100;

  const visible = useMemo(
    () =>
      items
        .filter((i) => (catId === "all" || i.categoryId === catId) && (showArchived || !i.archived))
        .filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.sort - b.sort),
    [items, catId, showArchived, q],
  );
  const selectedCat = categories.find((c) => c.id === catId) ?? null;

  function moveCat(id: string, dir: -1 | 1) {
    const ids = categories.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderCategories.mutate(ids);
  }

  return (
    <div className="p-6 mob:p-4 max-w-5xl">
      <ScreenHeader
        title="Carta"
        subtitle="Crea tus categorías y platos, sus recetas y precios por sucursal"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditingCat("new")}>
              ＋ Categoría
            </Button>
            <Button size="sm" onClick={() => setEditing("new")} disabled={categories.length === 0}>
              ＋ Plato
            </Button>
          </>
        }
      />

      {pending > 0 && (
        <Link to="/pos/carta" className="mb-4 flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <span>
            Hay {pending} {pending === 1 ? "cambio propuesto" : "cambios propuestos"} para revisar.
          </span>
          <span className="font-semibold">Revisar →</span>
        </Link>
      )}

      <div role="tablist" aria-label="Secciones de la carta" className="flex gap-1 mb-4 border-b border-border">
        {(["platos", "modificadores"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm -mb-px border-b-2", tab === t ? "border-accent text-accent font-semibold" : "border-transparent text-muted")}
          >
            {t === "platos" ? "Platos" : "Extras y preferencias"}
          </button>
        ))}
      </div>

      {tab === "modificadores" ? (
        <ModifiersPanel />
      ) : isLoading ? (
        <p className="text-muted">Cargando carta…</p>
      ) : categories.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-4xl mb-2" aria-hidden="true">
            📖
          </p>
          <p className="font-semibold">Empieza creando tus categorías</p>
          <p className="text-muted text-sm mt-1">Por ejemplo: Entradas, Fondos, Bebidas, Postres. Luego agrega los platos.</p>
          <Button className="mt-4" onClick={() => setEditingCat("new")}>
            ＋ Crear primera categoría
          </Button>
        </Card>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3" aria-label="Categorías">
            <CatChip active={catId === "all"} onClick={() => setCatId("all")} label="Todas" count={items.filter((i) => !i.archived).length} />
            {categories.map((c) => (
              <CatChip
                key={c.id}
                active={catId === c.id}
                onClick={() => setCatId(c.id)}
                label={`${c.icon} ${c.name}`}
                count={items.filter((i) => i.categoryId === c.id && !i.archived).length}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar plato…"
              aria-label="Buscar plato"
              className="flex-1 min-w-[10rem] rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
            />
            {selectedCat && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => moveCat(selectedCat.id, -1)} aria-label="Mover categoría antes">
                  ◀
                </Button>
                <Button size="sm" variant="ghost" onClick={() => moveCat(selectedCat.id, 1)} aria-label="Mover categoría después">
                  ▶
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditingCat(selectedCat)}>
                  Editar categoría
                </Button>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Ver archivados
            </label>
          </div>

          {visible.length === 0 ? (
            <Card className="p-6 text-center text-muted">
              {q ? "Ningún plato coincide con la búsqueda." : "Esta categoría aún no tiene platos."}
              <div className="mt-3">
                <Button size="sm" onClick={() => setEditing("new")}>
                  ＋ Agregar plato
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="divide-y divide-border">
              {visible.map((it) => {
                const c = cost(it.id);
                const hasRecipe = (recipes[it.id]?.length ?? 0) > 0;
                const m = hasRecipe ? marginPct(it.price, c) : null;
                const special = overrides.filter((o) => o.itemId === it.id).length;
                return (
                  <div key={it.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 p-3", it.archived && "opacity-50")}>
                    <button onClick={() => setEditing(it)} className="flex flex-1 min-w-[12rem] items-center gap-3 text-left hover:opacity-80">
                      <span className="text-2xl" aria-hidden="true">
                        {it.emoji || "🍽️"}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{it.name}</span>
                          {!it.available && <Badge tone="warning">Agotado</Badge>}
                          {it.archived && <Badge>Archivado</Badge>}
                          {it.badge && <Badge tone="accent">{it.badge}</Badge>}
                          {special > 0 && <Badge tone="neutral">🏬 {special === 1 ? "1 sucursal distinta" : `${special} sucursales distintas`}</Badge>}
                        </span>
                        <span className="block text-muted text-xs">
                          {hasRecipe ? (
                            <>
                              Costo {formatMoney(c)}
                              {m != null && (
                                <span className={cn("ml-1", TONE_TEXT[foodCostTone(it.price, c)])}>· margen {m}%</span>
                              )}
                            </>
                          ) : (
                            "Sin receta (no descuenta inventario)"
                          )}
                        </span>
                      </span>
                    </button>
                    <span className="font-mono font-semibold">{formatMoney(it.price)}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(it)}>
                        Editar
                      </Button>
                      {it.archived && (
                        <Button size="sm" variant="ghost" onClick={() => archiveItem.mutate({ id: it.id, archived: false })}>
                          Restaurar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
          <p className="text-muted text-xs mt-2">Los precios son finales, con IGV incluido.</p>
        </>
      )}

      {editing && (
        <ItemModal
          item={editing === "new" ? null : editing}
          defaultCategoryId={catId !== "all" ? catId : categories[0]?.id ?? ""}
          categories={categories}
          overrides={overrides}
          onClose={() => setEditing(null)}
        />
      )}
      {editingCat && (
        <CategoryModal
          category={editingCat === "new" ? null : editingCat}
          itemCount={editingCat === "new" ? 0 : items.filter((i) => i.categoryId === editingCat.id).length}
          onClose={(createdOrDeleted) => {
            setEditingCat(null);
            if (createdOrDeleted === "deleted") setCatId("all");
          }}
        />
      )}
    </div>
  );
}

function CatChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap",
        active ? "bg-accent/20 border-accent text-accent font-semibold" : "bg-chip-bg border-border",
      )}
    >
      {label} <span className="text-xs opacity-70">{count}</span>
    </button>
  );
}
