// Consolidado del árbol de sucursales: la empresa, cada rama y cada local.
import { Fragment, useMemo, useState } from "react";
import { useBranchReport, useBranches } from "@/data/hooks";
import { Card, CardBody } from "@/components/ui/Card";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { avgTicket, foodCostPct, grandTotal, grossMargin, rollup, type Figures, type ReportNode } from "@/lib/branchReport";

export function ConsolidadoCard({ from, rangoLabel }: { from: string | null; rangoLabel: string }) {
  const { data: branches = [] } = useBranches();
  const { data: rows = [], isLoading } = useBranchReport(from);
  const tree = useMemo(() => rollup(branches, rows), [branches, rows]);
  const total = useMemo(() => grandTotal(tree), [tree]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);

  if (branches.length <= 1) return null;
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const find = (nodes: ReportNode[], id: string): ReportNode | undefined => {
    for (const n of nodes) {
      if (n.branch.id === id) return n;
      const c = find(n.children, id);
      if (c) return c;
    }
  };
  const sel = selected ? find(tree, selected) : undefined;
  const detail: { title: string; f: Figures } = sel
    ? { title: sel.children.length ? `Rama ${sel.branch.name}` : sel.branch.name, f: sel.branchTotal }
    : { title: "Toda la empresa", f: total };

  const renderNode = (n: ReportNode): JSX.Element => {
    const hasKids = n.children.length > 0;
    const expanded = open.has(n.branch.id);
    return (
      <Fragment key={n.branch.id}>
        <Row
          depth={n.branch.depth}
          label={hasKids ? `${n.branch.name} · rama` : n.branch.name}
          hint={hasKids ? `${countLocals(n)} locales` : undefined}
          f={n.branchTotal}
          bold={hasKids}
          caret={hasKids ? (expanded ? "▾" : "▸") : undefined}
          onCaret={() => toggle(n.branch.id)}
          selected={selected === n.branch.id}
          onSelect={() => setSelected(selected === n.branch.id ? null : n.branch.id)}
        />
        {hasKids && expanded && (
          <>
            <Row depth={n.branch.depth + 1} label={`${n.branch.name} (solo este local)`} f={n.own} muted />
            {n.children.map(renderNode)}
          </>
        )}
      </Fragment>
    );
  };

  return (
    <Card className="mb-4">
      <CardBody>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h3 className="font-semibold">Consolidado por sucursal</h3>
          <span className="text-xs text-muted">{rangoLabel} · todas las sucursales</span>
        </div>
        <p className="text-muted text-xs mb-3">
          Cada rama suma sus locales. Toca ▸ para abrirla y una fila para ver su detalle.
        </p>
        {isLoading ? (
          <p className="text-muted text-sm">Calculando…</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[36rem]">
              <thead>
                <tr className="text-muted text-xs uppercase tracking-wide border-b border-border">
                  <th className="text-left py-1.5 px-1">Sucursal</th>
                  <th className="text-right py-1.5 px-1">Ventas</th>
                  <th className="text-right py-1.5 px-1">Pedidos</th>
                  <th className="text-right py-1.5 px-1">Ticket prom.</th>
                  <th className="text-right py-1.5 px-1" title="Insumos consumidos + mermas, sobre la venta">Costo insumos</th>
                  <th className="text-right py-1.5 px-1">Margen bruto</th>
                </tr>
              </thead>
              <tbody>
                {tree.map(renderNode)}
                <Row depth={0} label="Total empresa" f={total} bold total selected={selected === null} onSelect={() => setSelected(null)} />
              </tbody>
            </table>
          </div>
        )}
        <Detail title={detail.title} f={detail.f} />
      </CardBody>
    </Card>
  );
}

function countLocals(n: ReportNode): number {
  return 1 + n.children.reduce((s, c) => s + countLocals(c), 0);
}

function Row(props: {
  depth: number;
  label: string;
  hint?: string;
  f: Figures;
  bold?: boolean;
  muted?: boolean;
  total?: boolean;
  caret?: string;
  onCaret?: () => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { f } = props;
  const pct = foodCostPct(f);
  return (
    <tr
      onClick={props.onSelect}
      className={cn(
        "border-b border-border-soft",
        props.onSelect && "cursor-pointer hover:bg-chip-bg",
        props.selected && "bg-accent/10",
        props.total && "border-t-2 border-border",
        props.muted && "text-muted",
      )}
    >
      <td className="py-1.5 px-1" style={{ paddingLeft: `${props.depth * 1.1 + 0.25}rem` }}>
        {props.caret ? (
          <button
            onClick={(e) => (e.stopPropagation(), props.onCaret?.())}
            aria-label={props.caret === "▾" ? `Cerrar ${props.label}` : `Abrir ${props.label}`}
            aria-expanded={props.caret === "▾"}
            className="mr-1 w-5 text-muted"
          >
            {props.caret}
          </button>
        ) : (
          props.depth > 0 && <span className="mr-1 text-muted">└</span>
        )}
        <span className={cn(props.bold && "font-semibold")}>{props.label}</span>
        {props.hint && <span className="ml-1 text-xs text-muted">({props.hint})</span>}
      </td>
      <td className={cn("py-1.5 px-1 text-right font-mono", props.bold && "font-semibold")}>{formatMoney(f.sales)}</td>
      <td className="py-1.5 px-1 text-right font-mono">{f.orders}</td>
      <td className="py-1.5 px-1 text-right font-mono">{formatMoney(avgTicket(f))}</td>
      <td className="py-1.5 px-1 text-right font-mono">
        {formatMoney(f.foodCost + f.wasteCost)}
        {pct != null && <span className={cn("ml-1 text-xs", pct > 35 ? "text-warning" : "text-muted")}>{pct}%</span>}
      </td>
      <td className="py-1.5 px-1 text-right font-mono">{formatMoney(grossMargin(f))}</td>
    </tr>
  );
}

function Detail({ title, f }: { title: string; f: Figures }) {
  const items: [string, number, string?][] = [
    ["Efectivo", f.cashSales],
    ["Tarjeta", f.cardSales],
    ["Yape / Plin / otros", f.digitalSales],
    ["Mermas", f.wasteCost],
    ["Compras de insumos", f.purchases],
    ["Traslados recibidos", f.transferIn],
    ["Traslados enviados", f.transferOut],
    ["Diferencias de caja", f.cashDiff, f.cashDiff < 0 ? "text-warning" : f.cashDiff > 0 ? "text-success" : undefined],
  ];
  return (
    <div className="mt-4 rounded-lg border border-border-soft p-3">
      <p className="text-sm font-semibold mb-2">Detalle · {title}</p>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
        {items.map(([k, v, tone]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className={cn("font-mono", tone)}>{formatMoney(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted mt-2">
        Los traslados entre locales de una misma rama se compensan en su total. Costos valorizados al costo actual de cada insumo.
      </p>
    </div>
  );
}
