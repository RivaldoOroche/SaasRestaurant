// Gestión del árbol de sucursales del restaurante: la sede principal es la raíz
// y cada sucursal cuelga de ella (o de otra sucursal, p. ej. por zona). El cupo
// del plan se ve siempre y el alta se bloquea con una explicación al llegar al
// límite (la base lo valida igual: branches_quota_guard).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBranchActions, useBranchQuota, useBranches } from "@/data/hooks";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { buildTree, descendants, flatten, indentedName, type BranchNode } from "@/lib/branchTree";
import { branchLimitLabel } from "@/lib/plans";
import { cn } from "@/lib/cn";
import type { Branch, BranchQuota } from "@/data/model";
import { formatMoney } from "@/lib/money";

type Draft = { id?: string; name: string; city: string; address: string; phone: string; parentId: string | null };

export function BranchesCard() {
  const { data: branches = [] } = useBranches();
  const { data: quota } = useBranchQuota();
  const { updateBranch, removeBranch } = useBranchActions();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(branches), [branches]);
  const root = tree[0];
  const full = quota?.remaining === 0;

  const openNew = (parentId: string | null) =>
    setDraft({ name: "", city: root?.city ?? "", address: "", phone: "", parentId: parentId ?? root?.id ?? null });
  const openEdit = (b: Branch) =>
    setDraft({ id: b.id, name: b.name, city: b.city, address: b.address ?? "", phone: b.phone ?? "", parentId: b.parentId ?? null });

  const act = (p: Promise<unknown>) => {
    setErr(null);
    p.catch((e) => setErr((e as Error).message));
  };

  return (
    <Card className="mb-4">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Sucursales</h3>
            <p className="text-muted text-xs mt-0.5">
              Tu restaurante es la sede principal; las sucursales dependen de ella. Cada una tiene sus mesas, caja,
              cocina e inventario.
            </p>
          </div>
          <Button size="sm" onClick={() => openNew(null)} disabled={full || !root}>
            ＋ Nueva sucursal
          </Button>
        </div>

        {quota && <QuotaBar quota={quota} />}
        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}

        <ul className="space-y-1.5" aria-label="Árbol de sucursales">
          {flatten(tree).map((n) => (
            <BranchRow
              key={n.id}
              node={n}
              canAddChild={!full && n.active !== false}
              onAdd={() => openNew(n.id)}
              onEdit={() => openEdit(n)}
              onToggle={() => act(updateBranch.mutateAsync({ id: n.id, patch: { active: n.active === false } }))}
              onRemove={() => {
                if (window.confirm(`¿Eliminar la sucursal ${n.name}? Si tiene mesas o ventas, mejor desactívala.`)) {
                  act(removeBranch.mutateAsync(n.id));
                }
              }}
            />
          ))}
        </ul>
      </CardBody>

      {draft && (
        <BranchForm
          draft={draft}
          branches={branches}
          extraCost={
            !draft.id && quota && quota.included !== null && quota.extraPrice !== null && quota.used >= quota.included
              ? quota.extraPrice
              : null
          }
          onClose={() => setDraft(null)}
          onSaved={() => setDraft(null)}
        />
      )}
    </Card>
  );
}

function QuotaBar({ quota }: { quota: BranchQuota }) {
  const { used, max, plan, included, extraPrice, extra, monthlyTotal } = quota;
  if (max === 0) {
    return (
      <div className="rounded-md bg-chip-bg p-3 text-sm">
        Plan <strong>{plan}</strong> · 1 local.{" "}
        {used > 0 ? (
          <span className="text-muted">Tus {used} sucursales actuales se mantienen; para abrir más, cambia a Pro.</span>
        ) : (
          <span className="text-muted">¿Vas a abrir otro local?</span>
        )}{" "}
        <Link to="/pos/plan" className="text-accent font-semibold hover:underline">
          Ver plan Pro (2 locales desde S/ 299) →
        </Link>
      </div>
    );
  }
  const cap = included ?? max;
  const pct = cap ? Math.min(100, (Math.min(used, cap) / Math.max(1, cap)) * 100) : 0;
  const full = max !== null && used >= max;
  return (
    <div className="rounded-md bg-chip-bg p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>
          Plan <strong>{plan}</strong> ·{" "}
          {branchLimitLabel({ maxBranches: max, includedBranches: included, extraBranchPrice: extraPrice })}
        </span>
        <span className={cn("font-mono", full && "text-warning font-semibold")}>
          {included !== null
            ? `${Math.min(used, included)} de ${included} sucursales incluidas`
            : max === null
              ? `${used} sucursales`
              : `${used} de ${max} sucursales`}
        </span>
      </div>
      {cap !== null && (
        <div className="h-1.5 rounded-full bg-border mt-2 overflow-hidden" role="progressbar" aria-valuenow={used} aria-valuemax={cap} aria-label="Sucursales usadas">
          <div className={cn("h-full rounded-full", full ? "bg-warning" : "bg-accent")} style={{ width: `${pct}%` }} />
        </div>
      )}
      {extra > 0 && extraPrice !== null && (
        <p className="text-xs mt-2">
          + {extra} {extra === 1 ? "sucursal adicional" : "sucursales adicionales"} × {formatMoney(extraPrice)} ={" "}
          <strong>{formatMoney(monthlyTotal)}/mes</strong> en total (IGV incluido).
        </p>
      )}
      {full && (
        <p className="text-xs mt-2">
          Llegaste al límite de tu plan.{" "}
          <Link to="/pos/plan" className="text-accent font-semibold hover:underline">
            Mejorar plan →
          </Link>{" "}
          <span className="text-muted">o desactiva una sucursal para liberar cupo.</span>
        </p>
      )}
    </div>
  );
}

function BranchRow({
  node,
  canAddChild,
  onAdd,
  onEdit,
  onToggle,
  onRemove,
}: {
  node: BranchNode;
  canAddChild: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const isRoot = !node.parentId;
  const inactive = node.active === false;
  return (
    <li
      className={cn(
        "rounded-md border p-2.5 flex flex-wrap items-center gap-x-3 gap-y-2",
        isRoot ? "border-accent/50 bg-accent/5" : "border-border-soft bg-surface-alt",
        inactive && "opacity-55",
      )}
      style={{ marginLeft: `${Math.min(node.depth, 4) * 1.25}rem` }}
    >
      <span aria-hidden="true" className="text-lg">
        {isRoot ? "🏢" : "🏬"}
      </span>
      <div className="flex-1 min-w-[9rem]">
        <p className="font-semibold text-sm flex flex-wrap items-center gap-1.5">
          {node.name}
          {isRoot && <Badge tone="accent">Principal</Badge>}
          {inactive && <Badge>Inactiva</Badge>}
        </p>
        <p className="text-muted text-xs truncate">
          {[node.address, node.city].filter(Boolean).join(" · ") || "Sin dirección"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1 ml-auto">
        {canAddChild && (
          <Button size="sm" variant="ghost" onClick={onAdd} title="Agregar una sucursal que dependa de esta">
            ＋ Hija
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Editar ${node.name}`}>
          Editar
        </Button>
        {!isRoot && (
          <>
            <Button size="sm" variant="ghost" onClick={onToggle}>
              {inactive ? "Activar" : "Desactivar"}
            </Button>
            <button onClick={onRemove} className="text-warning text-sm px-2" aria-label={`Eliminar sucursal ${node.name}`} title="Eliminar">
              ✕
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function BranchForm({
  draft,
  branches,
  extraCost,
  onClose,
  onSaved,
}: {
  draft: Draft;
  branches: Branch[];
  /** Si la nueva sucursal se cobra aparte: su precio mensual. */
  extraCost: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addBranch, updateBranch } = useBranchActions();
  const [d, setD] = useState(draft);
  const [err, setErr] = useState<string | null>(null);
  const isRoot = !!draft.id && !draft.parentId;
  // Padres posibles: cualquiera menos ella misma y sus dependientes.
  const blocked = draft.id ? new Set([draft.id, ...descendants(branches, draft.id)]) : new Set<string>();
  const parents = flatten(buildTree(branches)).filter((b) => !blocked.has(b.id) && b.active !== false);
  const busy = addBranch.isPending || updateBranch.isPending;

  async function save() {
    setErr(null);
    if (!d.name.trim()) return setErr("Escribe el nombre de la sucursal.");
    const input = { name: d.name.trim(), city: d.city.trim(), address: d.address.trim(), phone: d.phone.trim() };
    try {
      if (d.id) await updateBranch.mutateAsync({ id: d.id, patch: isRoot ? input : { ...input, parentId: d.parentId } });
      else await addBranch.mutateAsync({ ...input, parentId: d.parentId });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const field = "w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";
  return (
    <Modal open onClose={onClose} labelledBy="branch-form-title">
      <form
        className="p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="branch-form-title" className="text-lg font-bold">
          {d.id ? (isRoot ? "Sede principal" : "Editar sucursal") : "Nueva sucursal"}
        </h2>
        <label className="block">
          <span className="text-xs text-muted">Nombre</span>
          <input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ej. Surco" className={field} />
        </label>
        <div className="grid grid-cols-2 mob:grid-cols-1 gap-3">
          <label className="block">
            <span className="text-xs text-muted">Ciudad</span>
            <input value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} placeholder="Lima" className={field} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Teléfono</span>
            <input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} inputMode="tel" className={field} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-muted">Dirección</span>
          <input value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} placeholder="Av. … 123" className={field} />
        </label>
        {!isRoot && (
          <label className="block">
            <span className="text-xs text-muted">Depende de</span>
            <select value={d.parentId ?? ""} onChange={(e) => setD({ ...d, parentId: e.target.value })} className={field}>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {indentedName(p)}
                  {!p.parentId ? " (principal)" : ""}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted">
              Útil para agrupar por zona o marca; la mayoría de restaurantes cuelga todo de la principal.
            </span>
          </label>
        )}
        {extraCost !== null && (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm">
            Ya usas todas las sucursales incluidas en tu plan. Esta se suma a tu mensualidad:{" "}
            <strong>+ {formatMoney(extraCost)} al mes</strong> (IGV incluido), mientras esté activa.
          </p>
        )}
        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando…" : d.id ? "Guardar" : "Crear sucursal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
