import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import { useSummary } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { formatMoney } from "@/lib/money";

export function Resumen() {
  const { data: s } = useSummary();
  if (!s) return null;
  const maxMonth = Math.max(...s.mrrByMonth.map((m) => m.value));

  return (
    <div className="p-6 max-w-6xl">
      <ScreenHeader title="Wayra POS · Consola de plataforma" subtitle="Tu negocio SaaS · provees el POS a tus clientes (tenants)" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Kpi label="MRR" value={formatMoney(s.mrr)} note="ingreso recurrente mensual" />
        <Kpi label="ARR proyectado" value={formatMoney(s.arr)} note="anualizado" />
        <Kpi label="Tenants activos" value={`${s.activeTenants} / ${s.totalTenants}`} note={`churn ${s.churnPct}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <h3 className="font-semibold">Ingreso recurrente (MRR)</h3>
            <p className="text-muted text-xs mb-3">Miles de soles · últimos 6 meses</p>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.mrrByMonth}>
                  <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {s.mrrByMonth.map((m, i) => (
                      <Cell key={i} fill={m.value === maxMonth ? "#a99fe2" : "#9184d9"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardBody>
              <h3 className="font-semibold mb-2">MRR por plan</h3>
              <ul className="space-y-2">
                {s.mrrByPlan.map((p) => (
                  <li key={p.plan} className="flex justify-between text-sm">
                    <span>
                      {p.plan} <span className="text-muted">· {p.count} tenants</span>
                    </span>
                    <span className="font-mono">{formatMoney(p.value)}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h3 className="font-semibold mb-2">Altas recientes</h3>
              <ul className="space-y-2">
                {s.recentSignups.map((r) => (
                  <li key={r.name} className="flex justify-between text-sm">
                    <span>{r.name}</span>
                    <span className="text-muted">
                      {r.plan} · {r.when}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-muted text-xs uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold font-mono mt-1">{value}</p>
        <p className="text-success text-xs mt-0.5">{note}</p>
      </CardBody>
    </Card>
  );
}
