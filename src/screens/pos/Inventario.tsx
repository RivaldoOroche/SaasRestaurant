// Inventario por sucursal: insumos (crear/editar), compras, mermas, conteo
// físico, traslados entre sucursales y el kardex de movimientos. Todo funciona
// sin conexión: los movimientos se encolan y se aplican al volver la red.
import { useMemo, useState } from "react";
import { useBranches, useInventory, useInventoryMovements } from "@/data/hooks";
import { useBranchStore } from "@/store/branch";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { inventoryStatus, fmtQty, MOVEMENT_LABEL } from "@/lib/inventory";
import type { InventoryItem } from "@/data/model";
import { InsumoModal } from "./inventario/InsumoModal";
import { MovementModal, type MovementKind } from "./inventario/MovementModal";

const TONE = { ok: "success", bajo: "warning", agotado: "neutral" } as const;
const LABEL = { ok: "En nivel", bajo: "Stock bajo", agotado: "Agotado" };
type Tab = "stock" | "movimientos";

export function Inventario() {
  const { data: items = [], isLoading } = useInventory();
  const { data: branches = [] } = useBranches();
  const branchId = useBranchStore((s) => s.branchId);
  const [tab, setTab] = useState<Tab>("stock");
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);
  const [moving, setMoving] = useState<{ item: InventoryItem | null; kind: MovementKind } | null>(null);

  const activeBranches = branches.filter((b) => b.active !== false);
  const branchName = branchId ? branches.find((b) => b.id === branchId)?.name : null;
  const low = items.filter((i) => inventoryStatus(i) === "bajo").length;
  const out = items.filter((i) => inventoryStatus(i) === "agotado").length;
  const value = items.reduce((s, i) => s + Math.max(0, i.stock) * (i.cost ?? 0), 0);

  const visible = useMemo(
    () =>
      items
        .filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))
        .filter((i) => !onlyLow || inventoryStatus(i) !== "ok"),
    [items, q, onlyLow],
  );

  return (
    <div className="p-6 mob:p-4 max-w-4xl">
      <ScreenHeader
        title="Inventario"
        subtitle={branchName ? `Stock de ${branchName}` : "Stock de todas las sucursales (suma)"}
        actions={
          <>
            {activeBranches.length > 1 && (
              <Button size="sm" variant="secondary" onClick={() => setMoving({ item: null, kind: "traslado" })} disabled={items.length === 0}>
                ⇄ Trasladar
              </Button>
            )}
            <Button size="sm" onClick={() => setEditing("new")}>
              ＋ Insumo
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-4 mob:grid-cols-2 gap-3 mb-4">
        <Stat label="Insumos" value={String(items.length)} />
        <Stat label="Stock bajo" value={String(low)} tone={low ? "warning" : undefined} onClick={low ? () => setOnlyLow(true) : undefined} />
        <Stat label="Agotados" value={String(out)} tone={out ? "neutral" : undefined} onClick={out ? () => setOnlyLow(true) : undefined} />
        <Stat label="Valor en stock" value={formatMoney(value)} />
      </div>

      <div role="tablist" aria-label="Secciones del inventario" className="flex gap-1 mb-4 border-b border-border">
        {(["stock", "movimientos"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm -mb-px border-b-2", tab === t ? "border-accent text-accent font-semibold" : "border-transparent text-muted")}
          >
            {t === "stock" ? "Stock" : "Movimientos"}
          </button>
        ))}
      </div>

      {tab === "movimientos" ? (
        <Kardex />
      ) : isLoading ? (
        <p className="text-muted">Cargando inventario…</p>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-4xl mb-2" aria-hidden="true">
            📦
          </p>
          <p className="font-semibold">Registra tus insumos</p>
          <p className="text-muted text-sm mt-1">
            Pescado, limón, papa, gaseosas… Luego úsalos en las recetas de tus platos y el stock se descontará solo con cada venta.
          </p>
          <Button className="mt-4" onClick={() => setEditing("new")}>
            ＋ Crear primer insumo
          </Button>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar insumo…"
              aria-label="Buscar insumo"
              className="flex-1 min-w-[10rem] rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
              Solo por reponer
            </label>
          </div>
          {visible.length === 0 ? (
            <Card className="p-6 text-center text-muted">Ningún insumo coincide.</Card>
          ) : (
            <Card className="divide-y divide-border">
              {visible.map((i) => {
                const st = inventoryStatus(i);
                const pct = Math.max(0, Math.min(100, Math.round((i.stock / Math.max(i.par, 1)) * 100)));
                return (
                  <div key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 mob:p-3">
                    <button onClick={() => setEditing(i)} className="flex-1 min-w-[11rem] text-left hover:opacity-80">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{i.name}</span>
                        <Badge tone={TONE[st]}>{LABEL[st]}</Badge>
                      </span>
                      <span className="block mt-1.5 h-1.5 rounded-full bg-chip-bg overflow-hidden max-w-xs">
                        <span
                          className={cn("block h-full rounded-full", st === "ok" ? "bg-success" : st === "bajo" ? "bg-warning" : "bg-neutral")}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="block text-muted text-xs mt-1">
                        <span className="font-mono text-ink">{fmtQty(i.stock)}</span> {i.unit} · ideal {fmtQty(i.par)}
                        {i.cost ? ` · ${formatMoney(i.cost)}/${i.unit}` : ""}
                      </span>
                    </button>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => setMoving({ item: i, kind: "compra" })} aria-label={`Registrar compra de ${i.name}`}>
                        ＋ Compra
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setMoving({ item: i, kind: "conteo" })} aria-label={`Más movimientos de ${i.name}`}>
                        Registrar…
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
          <p className="text-muted text-xs mt-2">
            Toca un insumo para editar su nombre, unidad, costo o stock ideal. Las ventas descuentan el stock según la receta de cada plato.
          </p>
        </>
      )}

      {editing && <InsumoModal item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {moving && <MovementModal item={moving.item} initialKind={moving.kind} onClose={() => setMoving(null)} />}
    </div>
  );
}

function Kardex() {
  const { data: moves = [], isLoading } = useInventoryMovements();
  const branchId = useBranchStore((s) => s.branchId);
  if (isLoading) return <p className="text-muted">Cargando movimientos…</p>;
  if (moves.length === 0)
    return <Card className="p-6 text-center text-muted">Aún no hay movimientos. Aparecerán aquí las compras, mermas, conteos, traslados y ventas.</Card>;
  return (
    <Card className="divide-y divide-border">
      {moves.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
          <span className="w-24 text-muted text-xs">{new Date(m.at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</span>
          <span className="flex-1 min-w-[10rem]">
            <span className="font-medium">{m.itemName}</span>
            <span className="text-muted">
              {" "}
              · {MOVEMENT_LABEL[m.reason]}
              {!branchId && ` · ${m.branchName}`}
              {m.note && ` · ${m.note}`}
            </span>
            {m.pending && (
              <Badge tone="warning" className="ml-2">
                Por sincronizar
              </Badge>
            )}
          </span>
          <span className={cn("font-mono font-semibold", m.delta >= 0 ? "text-success" : "text-warning")}>
            {m.delta > 0 ? "+" : ""}
            {fmtQty(m.delta)} {m.unit}
          </span>
          <span className="w-24 text-right text-muted text-xs truncate">{m.actor}</span>
        </div>
      ))}
    </Card>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: string; tone?: "warning" | "neutral"; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cn("rounded-lg border border-border bg-surface px-3 py-2 text-left", onClick && "hover:border-accent")}>
      <p className={cn("text-lg font-bold font-mono", tone === "warning" && "text-warning", tone === "neutral" && "text-neutral")}>{value}</p>
      <p className="text-muted text-xs">{label}</p>
    </Tag>
  );
}
