// Consolidado del árbol: cada sucursal con sus cifras propias y las de su rama
// (ella + todas las que dependen de ella). La raíz de la rama principal es el
// total de la empresa.
import type { Branch, BranchReportRow } from "@/data/model";
import { buildTree, type BranchNode } from "./branchTree";

export type Figures = Omit<BranchReportRow, "branchId">;
const KEYS: (keyof Figures)[] = [
  "sales", "orders", "cashSales", "cardSales", "digitalSales", "foodCost",
  "wasteCost", "purchases", "transferIn", "transferOut", "cashDiff",
];

export const emptyFigures = (): Figures => Object.fromEntries(KEYS.map((k) => [k, 0])) as Figures;

export function addFigures(a: Figures, b: Figures): Figures {
  const out = emptyFigures();
  for (const k of KEYS) out[k] = Math.round((a[k] + b[k]) * 100) / 100;
  return out;
}

export interface ReportNode {
  branch: BranchNode;
  own: Figures;
  /** own + todas las sucursales hijas (recursivo). */
  branchTotal: Figures;
  children: ReportNode[];
}

export function rollup(branches: Branch[], rows: BranchReportRow[]): ReportNode[] {
  const byId = new Map(rows.map((r) => [r.branchId, r]));
  const make = (n: BranchNode): ReportNode => {
    const { branchId: _omit, ...own } = byId.get(n.id) ?? { branchId: n.id, ...emptyFigures() };
    void _omit;
    const children = n.children.map(make);
    const branchTotal = children.reduce((acc, c) => addFigures(acc, c.branchTotal), own as Figures);
    return { branch: n, own: own as Figures, branchTotal, children };
  };
  return buildTree(branches).map(make);
}

/** Total de toda la empresa (todas las raíces). */
export function grandTotal(nodes: ReportNode[]): Figures {
  return nodes.reduce((acc, n) => addFigures(acc, n.branchTotal), emptyFigures());
}

/** Margen bruto: ventas − insumos consumidos − mermas. */
export const grossMargin = (f: Figures) => Math.round((f.sales - f.foodCost - f.wasteCost) * 100) / 100;
export const avgTicket = (f: Figures) => (f.orders ? Math.round((f.sales / f.orders) * 100) / 100 : 0);
/** Costo de insumos como % de la venta (food cost %). */
export const foodCostPct = (f: Figures) => (f.sales ? Math.round(((f.foodCost + f.wasteCost) / f.sales) * 1000) / 10 : null);
