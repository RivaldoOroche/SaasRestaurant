// Ficha de un plato en tres pestañas: datos, receta (con costo y margen) y
// precio/disponibilidad por sucursal.
import { useMemo, useState } from "react";
import { useBranches, useInventory, useMenuActions, useRecipes, useTenantActions } from "@/data/hooks";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { marginPct } from "@/lib/menu";
import { buildTree, flatten } from "@/lib/branchTree";
import type { Category, MenuBranchOverride, MenuItem, MenuItemInput, RecipeLine } from "@/data/model";

type Tab = "datos" | "receta" | "sucursales";
const EMOJIS = ["🍽️", "🐟", "🥩", "🍗", "🥔", "🍚", "🍝", "🥗", "🍲", "🌮", "🍔", "🍕", "🍣", "🍰", "🍮", "🍹", "🍸", "🥤", "☕", "🍺"];
const BADGES = ["", "Popular", "Chef", "Nuevo", "Picante", "Vegano"];
const field = "w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";
const num = (s: string) => Number(s.replace(",", ".")) || 0;

export function ItemModal({
  item,
  defaultCategoryId,
  categories,
  overrides,
  onClose,
}: {
  item: MenuItem | null;
  defaultCategoryId: string;
  categories: Category[];
  overrides: MenuBranchOverride[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("datos");
  // Un plato nuevo se guarda primero; luego se habilitan receta y sucursales.
  const [savedId, setSavedId] = useState<string | null>(item?.id ?? null);
  const [price, setPrice] = useState<number>(item?.price ?? 0);

  return (
    <Modal open onClose={onClose} labelledBy="item-title" className="max-w-xl">
      <div className="p-5">
        <h2 id="item-title" className="text-lg font-bold">
          {item ? item.name : "Nuevo plato"}
        </h2>
        <div role="tablist" className="flex gap-1 mt-3 mb-4 border-b border-border">
          {(["datos", "receta", "sucursales"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              disabled={!savedId && t !== "datos"}
              onClick={() => setTab(t)}
              title={!savedId && t !== "datos" ? "Guarda el plato primero" : undefined}
              className={cn(
                "px-3 py-1.5 text-sm -mb-px border-b-2 disabled:opacity-40",
                tab === t ? "border-accent text-accent font-semibold" : "border-transparent text-muted",
              )}
            >
              {t === "datos" ? "Datos" : t === "receta" ? "Receta y costo" : "Por sucursal"}
            </button>
          ))}
        </div>
        {tab === "datos" && (
          <DataTab
            item={item}
            defaultCategoryId={defaultCategoryId}
            categories={categories}
            onSaved={(id, p, isNew) => {
              setSavedId(id);
              setPrice(p);
              if (isNew) setTab("receta");
              else onClose();
            }}
            onClose={onClose}
          />
        )}
        {tab === "receta" && savedId && <RecipeTab itemId={savedId} price={price} onClose={onClose} />}
        {tab === "sucursales" && savedId && <BranchTab itemId={savedId} basePrice={price} baseAvailable={item?.available ?? true} overrides={overrides} />}
      </div>
    </Modal>
  );
}

function DataTab({
  item,
  defaultCategoryId,
  categories,
  onSaved,
  onClose,
}: {
  item: MenuItem | null;
  defaultCategoryId: string;
  categories: Category[];
  onSaved: (id: string, price: number, isNew: boolean) => void;
  onClose: () => void;
}) {
  const { saveItem, archiveItem } = useMenuActions();
  const [f, setF] = useState<MenuItemInput & { priceText: string }>({
    id: item?.id,
    categoryId: item?.categoryId ?? defaultCategoryId,
    name: item?.name ?? "",
    description: item?.description ?? "",
    price: item?.price ?? 0,
    priceText: item ? String(item.price) : "",
    emoji: item?.emoji ?? "🍽️",
    badge: item?.badge ?? null,
    veg: item?.veg ?? false,
    spicy: item?.spicy ?? false,
    gf: item?.gf ?? false,
    meat: item?.meat ?? false,
    available: item?.available ?? true,
  });
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    const { priceText, ...input } = f;
    try {
      const id = await saveItem.mutateAsync({ ...input, price: num(priceText) });
      onSaved(id, num(priceText), !item);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const flag = (k: "veg" | "spicy" | "gf" | "meat", label: string) => (
    <label className="flex items-center gap-1.5 text-sm">
      <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid grid-cols-[1fr_9rem] mob:grid-cols-1 gap-3">
        <label className="block">
          <span className="text-xs text-muted">Nombre</span>
          <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Lomo saltado" className={field} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Precio (IGV incluido)</span>
          <span className="flex items-center rounded-md bg-chip-bg border border-border focus-within:border-accent">
            <span className="pl-3 text-muted text-sm">S/</span>
            <input
              inputMode="decimal"
              value={f.priceText}
              onChange={(e) => setF({ ...f, priceText: e.target.value.replace(/[^\d.,]/g, "") })}
              placeholder="0.00"
              className="w-full bg-transparent px-2 py-2 text-sm font-mono outline-none"
              aria-label="Precio"
            />
          </span>
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-muted">Descripción (se ve en la carta digital)</span>
        <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ingredientes o acompañamiento" className={field} />
      </label>
      <div className="grid grid-cols-2 mob:grid-cols-1 gap-3">
        <label className="block">
          <span className="text-xs text-muted">Categoría</span>
          <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} className={field}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted">Etiqueta</span>
          <select value={f.badge ?? ""} onChange={(e) => setF({ ...f, badge: e.target.value || null })} className={field}>
            {BADGES.map((b) => (
              <option key={b} value={b}>
                {b || "Ninguna"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-xs text-muted mb-1">Ícono</legend>
        <div className="flex flex-wrap gap-1">
          {EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => setF({ ...f, emoji: e })}
              aria-pressed={f.emoji === e}
              className={cn("h-9 w-9 rounded-md text-lg", f.emoji === e ? "bg-accent/25 ring-1 ring-accent" : "bg-chip-bg")}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {flag("veg", "Vegetariano")}
        {flag("spicy", "Picante")}
        {flag("gf", "Sin gluten")}
        {flag("meat", "Con carne")}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} />
        Disponible para vender (desmárcalo si se agotó hoy)
      </label>
      {err && (
        <p role="alert" className="text-warning text-sm">
          {err}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2 pt-1">
        {item && !item.archived ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              if (window.confirm(`¿Archivar ${item.name}? Dejará de aparecer en la carta; su historial de ventas se conserva.`)) {
                archiveItem.mutate({ id: item.id, archived: true }, { onSuccess: onClose });
              }
            }}
          >
            Archivar
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saveItem.isPending}>
            {saveItem.isPending ? "Guardando…" : item ? "Guardar" : "Crear y seguir con la receta →"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function RecipeTab({ itemId, price, onClose }: { itemId: string; price: number; onClose: () => void }) {
  const { data: inventory = [] } = useInventory();
  const { data: recipes = {} } = useRecipes();
  const { setRecipe } = useTenantActions();
  const { saveInventoryItem } = useMenuActions();
  // La cantidad se edita como texto para poder escribir "0.25" o "0,25".
  const [lines, setLines] = useState<(RecipeLine & { qtyText: string })[]>(() =>
    (recipes[itemId] ?? []).map((l) => ({ ...l, qtyText: String(l.qtyPerUnit) })),
  );
  const [creating, setCreating] = useState(false);
  const [nuevo, setNuevo] = useState({ name: "", unit: "kg", cost: "" });
  const [err, setErr] = useState<string | null>(null);

  const costOf = (l: RecipeLine) => (inventory.find((i) => i.id === l.inventoryId)?.cost ?? 0) * l.qtyPerUnit;
  const total = Math.round(lines.reduce((c, l) => c + costOf(l), 0) * 100) / 100;
  const m = marginPct(price, total);
  const unused = useMemo(() => inventory.filter((i) => !lines.some((l) => l.inventoryId === i.id)), [inventory, lines]);

  async function createInsumo() {
    setErr(null);
    try {
      const id = await saveInventoryItem.mutateAsync({ name: nuevo.name, unit: nuevo.unit, cost: num(nuevo.cost), par: 0 });
      setLines([...lines, { inventoryId: id, qtyPerUnit: 0.1, qtyText: "0.1" }]);
      setCreating(false);
      setNuevo({ name: "", unit: "kg", cost: "" });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        ¿Qué lleva una porción? Al vender el plato, el inventario de la sucursal se descuenta solo.
      </p>
      {lines.length === 0 && <p className="text-sm rounded-md bg-chip-bg p-3">Aún sin insumos.</p>}
      {lines.map((l, idx) => {
        const inv = inventory.find((i) => i.id === l.inventoryId);
        return (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <select
              value={l.inventoryId}
              onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, inventoryId: e.target.value } : x)))}
              aria-label="Insumo"
              className="flex-1 min-w-[9rem] rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm"
            >
              {inventory.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <input
              inputMode="decimal"
              value={l.qtyText}
              onChange={(e) => {
                const t = e.target.value.replace(/[^\d.,]/g, "");
                setLines(lines.map((x, i) => (i === idx ? { ...x, qtyText: t, qtyPerUnit: num(t) } : x)));
              }}
              aria-label={`Cantidad de ${inv?.name ?? "insumo"}`}
              className="w-20 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm font-mono text-right"
            />
            <span className="w-10 text-xs text-muted">{inv?.unit}</span>
            <span className="w-20 text-right font-mono text-xs">{formatMoney(costOf(l))}</span>
            <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-warning px-1" aria-label="Quitar insumo">
              ✕
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={unused.length === 0} onClick={() => setLines([...lines, { inventoryId: unused[0].id, qtyPerUnit: 0.1, qtyText: "0.1" }])}>
          ＋ Agregar insumo
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCreating(!creating)}>
          ＋ Crear insumo nuevo
        </Button>
      </div>
      {creating && (
        <div className="rounded-md border border-border p-3 grid grid-cols-[1fr_5rem_6rem_auto] mob:grid-cols-2 gap-2 items-end">
          <label className="block">
            <span className="text-xs text-muted">Insumo</span>
            <input value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })} placeholder="Ej. Cebolla roja" className={field} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Unidad</span>
            <select value={nuevo.unit} onChange={(e) => setNuevo({ ...nuevo, unit: e.target.value })} className={field}>
              {["kg", "g", "l", "ml", "und", "atado", "bot", "lata"].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted">Costo por {nuevo.unit}</span>
            <input inputMode="decimal" value={nuevo.cost} onChange={(e) => setNuevo({ ...nuevo, cost: e.target.value })} placeholder="0.00" className={field} />
          </label>
          <Button size="sm" onClick={createInsumo} disabled={!nuevo.name.trim() || saveInventoryItem.isPending}>
            Crear
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-alt border border-border-soft p-3 text-sm">
        <span>
          Costo por porción <span className="font-mono font-semibold">{formatMoney(total)}</span>
        </span>
        <span>
          Precio {formatMoney(price)}
          {m != null && total > 0 && (
            <>
              {" · "}
              <span className={m >= 65 ? "text-success" : m >= 55 ? "text-warning" : "text-muted"}>margen {m}%</span>
            </>
          )}
        </span>
      </div>
      <p className="text-xs text-muted">Referencia: la mayoría de restaurantes apunta a que el costo sea 30-35 % del precio.</p>
      {err && <p className="text-warning text-sm">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        <Button
          disabled={setRecipe.isPending}
          onClick={() => setRecipe.mutate({ menuItemId: itemId, lines: lines.filter((l) => l.qtyPerUnit > 0).map(({ inventoryId, qtyPerUnit }) => ({ inventoryId, qtyPerUnit })) }, { onSuccess: onClose })}
        >
          Guardar receta
        </Button>
      </div>
    </div>
  );
}

function BranchTab({
  itemId,
  basePrice,
  baseAvailable,
  overrides,
}: {
  itemId: string;
  basePrice: number;
  baseAvailable: boolean;
  overrides: MenuBranchOverride[];
}) {
  const { data: branches = [] } = useBranches();
  const { setOverride } = useMenuActions();
  const tree = flatten(buildTree(branches.filter((b) => b.active !== false)));
  if (tree.length <= 1) {
    return <p className="text-sm text-muted">Tienes una sola sucursal: el precio y la disponibilidad generales aplican ahí.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Deja vacío para usar el precio general ({formatMoney(basePrice)}). Útil si una sucursal cobra distinto o no ofrece el plato.
      </p>
      {tree.map((b) => {
        const o = overrides.find((x) => x.itemId === itemId && x.branchId === b.id);
        return <BranchRow key={b.id} name={b.name} depth={b.depth} override={o} baseAvailable={baseAvailable} onSave={(price, available) => setOverride.mutate({ itemId, branchId: b.id, price, available })} />;
      })}
    </div>
  );
}

function BranchRow({
  name,
  depth,
  override,
  baseAvailable,
  onSave,
}: {
  name: string;
  depth: number;
  override?: MenuBranchOverride;
  baseAvailable: boolean;
  onSave: (price: number | null, available: boolean | null) => void;
}) {
  const [price, setPrice] = useState(override?.price != null ? String(override.price) : "");
  const avail = override?.available ?? null;
  const [saved, setSaved] = useState(false);
  const initial = override?.price != null ? String(override.price) : "";
  const commit = (p: string, a: boolean | null) => {
    if (p === initial && a === avail) return;
    onSave(p.trim() === "" ? null : num(p), a);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-soft p-2" style={{ marginLeft: `${depth}rem` }}>
      <span className="flex-1 min-w-[7rem] text-sm font-medium">{name}</span>
      <span className="flex items-center rounded-md bg-chip-bg border border-border w-28">
        <span className="pl-2 text-muted text-xs">S/</span>
        <input
          inputMode="decimal"
          value={price}
          placeholder="general"
          aria-label={`Precio en ${name}`}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))}
          onBlur={() => commit(price, avail)}
          className="w-full bg-transparent px-1.5 py-1.5 text-sm font-mono outline-none"
        />
      </span>
      <select
        value={avail === null ? "" : avail ? "si" : "no"}
        aria-label={`Disponibilidad en ${name}`}
        onChange={(e) => commit(price, e.target.value === "" ? null : e.target.value === "si")}
        className="rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm"
      >
        <option value="">Como en general ({baseAvailable ? "sí" : "no"})</option>
        <option value="si">Se vende aquí</option>
        <option value="no">No se vende aquí</option>
      </select>
      <span className="w-16 text-xs text-success" aria-live="polite">
        {saved ? "✓ Guardado" : ""}
      </span>
    </div>
  );
}
