import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import {
  usePaidOrders,
  useComprobantes,
  useMenuItems,
  useInventory,
  useRecipes,
  useSettings,
} from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { isAdmin } from "@/lib/roles";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatMoney, round2 } from "@/lib/money";
import { exportReporteExcel } from "@/lib/exportReporte";
import { cn } from "@/lib/cn";
import type { Order } from "@/data/model";

type Rango = "hoy" | "semana" | "mes";
const RANGO_LABEL: Record<Rango, string> = { hoy: "Hoy", semana: "Últimos 7 días", mes: "Últimos 30 días" };

function net(o: Order): number {
  return o.lines.reduce((s, l) => s + (l.unitPrice + l.extraPrice) * l.qty, 0);
}
function collected(o: Order): number {
  return o.paidTotal ?? round2(net(o) * 1.18);
}
function sinceDays(days: number): number {
  return Date.now() - days * 86400000;
}

export function Reportes() {
  const { data: paidAll = [] } = usePaidOrders();
  const { data: comprobantes = [] } = useComprobantes();
  const { data: menuItems = [] } = useMenuItems();
  const { data: inventory = [] } = useInventory();
  const { data: recipes = {} } = useRecipes();
  const { data: settings } = useSettings();
  const { session } = useAuth();
  const admin = isAdmin(session?.role ?? "mesero");
  const taxRate = (settings?.taxRate ?? 18) / 100;

  const [rango, setRango] = useState<Rango>("mes");
  const [exporting, setExporting] = useState(false);

  const paid = useMemo(() => {
    if (rango === "hoy") {
      const t0 = new Date().setHours(0, 0, 0, 0);
      return paidAll.filter((o) => new Date(o.openedAt).getTime() >= t0);
    }
    const from = sinceDays(rango === "semana" ? 7 : 30);
    return paidAll.filter((o) => new Date(o.openedAt).getTime() >= from);
  }, [paidAll, rango]);

  const sales = useMemo(() => round2(paid.reduce((s, o) => s + collected(o), 0)), [paid]);
  const tickets = paid.length;
  const avg = tickets ? round2(sales / tickets) : 0;

  const byHour = useMemo(() => {
    const buckets: Record<number, number> = {};
    for (const o of paid) {
      const h = new Date(o.openedAt).getHours();
      buckets[h] = (buckets[h] ?? 0) + collected(o);
    }
    const hours = [12, 13, 14, 15, 19, 20, 21, 22];
    return hours.map((h) => ({ label: `${h}h`, value: round2(buckets[h] ?? 0) }));
  }, [paid]);

  // Food cost por platillo
  const foodCost = useMemo(() => {
    const costByInv = new Map(inventory.map((i) => [i.id, i.cost ?? 0]));
    const dishCost = (itemId: string): number => {
      const r = recipes[itemId];
      return r ? round2(r.reduce((s, x) => s + x.qtyPerUnit * (costByInv.get(x.inventoryId) ?? 0), 0)) : 0;
    };
    const agg = new Map<string, { name: string; qty: number; ing: number; itemId: string }>();
    for (const o of paid)
      for (const l of o.lines) {
        const key = l.itemId ?? l.name;
        const cur = agg.get(key) ?? { name: l.name, qty: 0, ing: 0, itemId: l.itemId ?? "" };
        cur.qty += l.qty;
        cur.ing = round2(cur.ing + (l.unitPrice + l.extraPrice) * l.qty);
        agg.set(key, cur);
      }
    return [...agg.values()]
      .map((v) => {
        const cu = dishCost(v.itemId);
        const mg = round2(v.ing - cu * v.qty);
        return { ...v, cu, mg, mgp: cu && v.ing ? mg / v.ing : null };
      })
      .sort((a, b) => b.qty - a.qty);
  }, [paid, inventory, recipes]);

  const maxHour = Math.max(1, ...byHour.map((b) => b.value));

  async function onExport() {
    setExporting(true);
    try {
      await exportReporteExcel({
        rangoLabel: RANGO_LABEL[rango],
        orders: paid,
        comprobantes,
        menuItems,
        inventory,
        recipes,
        taxRate,
        currency: settings?.currency ?? "PEN",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <ScreenHeader
        title="Reportes"
        subtitle={admin ? "Resumen del negocio" : `Mi desempeño · ${session?.staff?.name ?? ""}`}
        actions={
          <div className="flex items-center gap-2 no-print">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["hoy", "semana", "mes"] as Rango[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRango(r)}
                  className={cn("px-3 py-1.5 text-sm", rango === r ? "bg-accent text-white" : "bg-chip-bg text-ink")}
                >
                  {r === "hoy" ? "Hoy" : r === "semana" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
            {admin && (
              <Button size="sm" variant="secondary" onClick={onExport} disabled={exporting}>
                {exporting ? "Generando…" : "⬇ Exportar Excel"}
              </Button>
            )}
            <button onClick={() => window.print()} className="text-sm rounded-md border border-border px-3 py-1.5">
              🖨
            </button>
          </div>
        }
      />

      <div className="print-area grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Kpi label={`Ventas · ${RANGO_LABEL[rango]}`} value={formatMoney(sales)} />
        <Kpi label="Tickets" value={String(tickets)} />
        <Kpi label="Ticket promedio" value={formatMoney(avg)} />
      </div>

      <Card className="mb-4">
        <CardBody>
          <h3 className="font-semibold mb-1">Ventas por hora</h3>
          <p className="text-muted text-xs mb-3">Pedidos cobrados en el rango</p>
          {sales === 0 ? (
            <p className="text-muted text-sm py-8 text-center">
              Sin ventas cobradas en el rango. Cobra un pedido para ver el reporte.
            </p>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byHour}>
                  <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {byHour.map((b, i) => (
                      <Cell key={i} fill={b.value === maxHour ? "#a99fe2" : "#9184d9"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      {admin && (
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-3">Rentabilidad por platillo (food cost)</h3>
            {foodCost.length === 0 ? (
              <p className="text-muted text-sm">Sin datos en el rango.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted text-xs uppercase tracking-wide border-b border-border">
                      <th className="text-left py-1.5">Platillo</th>
                      <th className="text-right py-1.5">Vendidos</th>
                      <th className="text-right py-1.5">Ingreso</th>
                      <th className="text-right py-1.5">Costo receta</th>
                      <th className="text-right py-1.5">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foodCost.map((f) => (
                      <tr key={f.name} className="border-b border-border-soft last:border-0">
                        <td className="py-1.5">{f.name}</td>
                        <td className="py-1.5 text-right font-mono">{f.qty}</td>
                        <td className="py-1.5 text-right font-mono">{formatMoney(f.ing)}</td>
                        <td className="py-1.5 text-right font-mono text-muted">
                          {f.cu ? formatMoney(round2(f.cu * f.qty)) : "—"}
                        </td>
                        <td className="py-1.5 text-right font-mono">
                          {f.cu ? (
                            <span className="text-success">
                              {formatMoney(f.mg)} {f.mgp != null && `(${Math.round(f.mgp * 100)}%)`}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-muted text-xs uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold font-mono mt-1">{value}</p>
      </CardBody>
    </Card>
  );
}
