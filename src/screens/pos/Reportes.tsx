import { useMemo } from "react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import { usePaidOrders } from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { isAdmin } from "@/lib/roles";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { formatMoney, DEFAULT_TAX_RATE, round2 } from "@/lib/money";
import type { Order } from "@/data/model";

// Prefer the amount actually collected (net of discount, incl. tip) so reports
// match Caja; fall back to a gross line estimate only if paidTotal is missing.
function total(o: Order): number {
  if (o.paidTotal != null) return o.paidTotal;
  return round2(o.lines.reduce((s, l) => s + (l.unitPrice + l.extraPrice) * l.qty, 0) * (1 + DEFAULT_TAX_RATE));
}

export function Reportes() {
  const { data: paid = [] } = usePaidOrders();
  const { session } = useAuth();
  const admin = isAdmin(session?.role ?? "mesero");

  const sales = useMemo(() => round2(paid.reduce((s, o) => s + total(o), 0)), [paid]);
  const tickets = paid.length;
  const avg = tickets ? round2(sales / tickets) : 0;

  // Hourly distribution from paid orders' opened hour.
  const byHour = useMemo(() => {
    const buckets: Record<number, number> = {};
    for (const o of paid) {
      const h = new Date(o.openedAt).getHours();
      buckets[h] = (buckets[h] ?? 0) + total(o);
    }
    const hours = [12, 13, 14, 15, 19, 20, 21, 22];
    return hours.map((h) => ({ label: `${h}h`, value: round2(buckets[h] ?? 0) }));
  }, [paid]);

  const topItems = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of paid) for (const l of o.lines) counts[l.name] = (counts[l.name] ?? 0) + l.qty;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [paid]);

  const maxHour = Math.max(1, ...byHour.map((b) => b.value));

  return (
    <div className="p-6 max-w-5xl">
      <ScreenHeader
        title="Reportes"
        subtitle={admin ? "Resumen del negocio · hoy" : `Mi desempeño · ${session?.staff?.name ?? ""}`}
        actions={
          <button onClick={() => window.print()} className="text-sm rounded-md border border-border px-3 py-1.5 no-print">
            🖨 Imprimir
          </button>
        }
      />

      <div className="print-area grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Kpi label="Ventas del día" value={formatMoney(sales)} />
        <Kpi label="Tickets" value={String(tickets)} />
        <Kpi label="Ticket promedio" value={formatMoney(avg)} />
      </div>

      <Card className="mb-4">
        <CardBody>
          <h3 className="font-semibold mb-1">Ventas por hora</h3>
          <p className="text-muted text-xs mb-3">Miles de soles · pedidos cobrados</p>
          {sales === 0 ? (
            <p className="text-muted text-sm py-8 text-center">
              Aún no hay ventas cobradas hoy. Cobra un pedido para ver el reporte.
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
            <h3 className="font-semibold mb-3">Platillos más vendidos</h3>
            {topItems.length === 0 ? (
              <p className="text-muted text-sm">Sin datos todavía.</p>
            ) : (
              <ul className="space-y-2">
                {topItems.map(([name, qty]) => (
                  <li key={name} className="flex items-center justify-between text-sm">
                    <span>{name}</span>
                    <span className="font-mono text-muted">{qty} vendidos</span>
                  </li>
                ))}
              </ul>
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
