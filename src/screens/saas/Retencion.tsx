import { useRetention, useCohorts, useRevenueSeries } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

/** Cohortes reales por mes de alta + serie de ingresos real. */
function CohortsAndRevenue() {
  const { data: cohorts = [] } = useCohorts();
  const { data: revenue = [] } = useRevenueSeries();
  const maxRev = Math.max(1, ...revenue.map((p) => p.amount));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
      <Card>
        <CardBody>
          <h3 className="font-semibold mb-1">Cohortes por mes de alta</h3>
          <p className="text-muted text-xs mb-3">Retención actual de cada camada de clientes (dato real).</p>
          {cohorts.length === 0 ? (
            <p className="text-muted text-sm">Sin cohortes aún.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase tracking-wide">
                  <th className="text-left font-medium py-1">Cohorte</th>
                  <th className="text-right font-medium py-1">Altas</th>
                  <th className="text-right font-medium py-1">Activos</th>
                  <th className="text-right font-medium py-1">Retención</th>
                  <th className="text-right font-medium py-1">MRR</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohort} className="border-t border-border-soft">
                    <td className="py-1 font-mono">{c.cohort}</td>
                    <td className="py-1 text-right">{c.size}</td>
                    <td className="py-1 text-right">{c.active}</td>
                    <td className="py-1 text-right">
                      <span
                        className={cn(
                          "inline-block rounded px-1.5 py-0.5 text-xs",
                          c.retainedPct >= 80 ? "bg-success/20 text-success" : c.retainedPct >= 50 ? "bg-warning/20 text-warning" : "bg-chip-bg",
                        )}
                      >
                        {c.retainedPct}%
                      </span>
                    </td>
                    <td className="py-1 text-right font-mono">{formatMoney(c.mrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="font-semibold mb-1">Ingresos por mes</h3>
          <p className="text-muted text-xs mb-3">Facturas de suscripción cobradas (dato real).</p>
          {revenue.length === 0 ? (
            <p className="text-muted text-sm">Aún no hay cobros registrados.</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {revenue.map((p) => (
                <div key={p.month} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-[10px] font-mono mb-1">{Math.round(p.amount / 1000)}k</span>
                  <div className="w-full rounded-t bg-accent" style={{ height: `${(p.amount / maxRev) * 100}%` }} />
                  <span className="text-[10px] text-muted mt-1">{p.month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

const RISK_TONE = { low: "success", mid: "warning", high: "neutral" } as const;

export function Retencion() {
  const { data: r } = useRetention();
  if (!r) return null;
  const maxBar = Math.max(...r.waterfall.map((w) => w.value));

  return (
    <div className="p-6 mob:p-4 max-w-6xl">
      <ScreenHeader
        title="Retención & cobranza"
        subtitle="MRR neto, churn, pruebas, pagos fallidos y uso vs. límites"
        actions={
          <button onClick={() => window.print()} className="text-sm rounded-md border border-border px-3 py-1.5 no-print">
            🖨 Imprimir
          </button>
        }
      />

      <div className="print-area grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Retención de ingresos (NRR)" value={`${r.nrr}%`} note="expansión supera bajas" tone="success" />
        <Kpi label="Churn de clientes" value={`${r.churnPct}%`} note="mensual" tone="warning" />
        <Kpi label="LTV / CAC" value={`${(r.ltv / r.cac).toFixed(1)}×`} note={`LTV ${formatMoney(r.ltv)}`} tone="success" />
        <Kpi label="Vida media" value={`${r.lifetimeMonths} meses`} note="+3 vs. trimestre" />
      </div>

      <CohortsAndRevenue />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-3">MRR neto del mes (miles S/)</h3>
            <div className="flex items-end gap-2 h-40">
              {r.waterfall.map((w) => (
                <div key={w.label} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-xs font-mono mb-1">
                    {w.kind === "sub" ? "−" : w.kind === "add" ? "+" : ""}
                    {w.value}
                  </span>
                  <div
                    className={cn(
                      "w-full rounded-t",
                      w.kind === "add" ? "bg-success" : w.kind === "sub" ? "bg-warning" : "bg-accent",
                    )}
                    style={{ height: `${(w.value / maxBar) * 100}%` }}
                  />
                  <span className="text-[10px] text-muted mt-1 text-center">{w.label}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="font-semibold mb-3">Pruebas activas (trial → pago)</h3>
            <ul className="space-y-2">
              {r.trials.map((t) => (
                <li key={t.name} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-muted text-xs">{t.progress}% listo · {t.days}</p>
                  </div>
                  <Badge tone={RISK_TONE[t.risk]}>{t.risk === "low" ? "bajo" : t.risk === "mid" ? "medio" : "alto"} riesgo</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-3">Cobranza fallida (dunning)</h3>
            <ul className="space-y-2">
              {r.dunning.map((d) => (
                <li key={d.tenant} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{d.tenant}</p>
                    <p className="text-muted text-xs">
                      {formatMoney(d.amount)} · {d.reason} · {d.tries}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" className="no-print">
                    Reintentar cobro
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="font-semibold mb-3">Uso vs. límites & salud</h3>
            <ul className="space-y-2 mb-3">
              {r.usage.map((u) => (
                <li key={u.tenant + u.metric} className="text-sm">
                  <div className="flex justify-between">
                    <span>{u.tenant} · {u.metric}</span>
                    <span className="font-mono text-muted">
                      {u.cur}/{u.cap}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-chip-bg overflow-hidden mt-1">
                    <div
                      className={cn("h-full rounded-full", u.cur / u.cap > 0.85 ? "bg-warning" : "bg-accent")}
                      style={{ width: `${(u.cur / u.cap) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {r.health.map((h) => (
                <span key={h.svc} className="text-xs flex items-center gap-1">
                  <span className={cn("h-2 w-2 rounded-full", h.ok ? "bg-success" : "bg-warning")} />
                  {h.svc} {h.up}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "success" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-ink";
  return (
    <Card>
      <CardBody>
        <p className="text-muted text-xs">{label}</p>
        <p className={cn("text-2xl font-bold mt-1", color)}>{value}</p>
        <p className="text-muted text-xs mt-0.5">{note}</p>
      </CardBody>
    </Card>
  );
}
