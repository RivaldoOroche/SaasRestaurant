import { useActivityLog } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { formatMoney } from "@/lib/money";

// Representative branch comparison (per-branch financials are backend/Phase 5 data).
const BRANCHES = [
  { name: "Miraflores", city: "Lima", sales: 18400, up: "+12%" },
  { name: "San Isidro", city: "Lima", sales: 15200, up: "+6%" },
  { name: "Arequipa Centro", city: "Arequipa", sales: 9800, up: "+9%" },
];

export function Sucursales() {
  const { data: log = [] } = useActivityLog();
  const max = Math.max(...BRANCHES.map((b) => b.sales));

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader title="Dueño" subtitle="Comparativa de sucursales y bitácora de actividad" />

      <Card className="mb-4">
        <CardBody>
          <h3 className="font-semibold mb-3">Ventas por sucursal (mes)</h3>
          <div className="space-y-3">
            {BRANCHES.map((b) => (
              <div key={b.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">
                    {b.name} <span className="text-muted">· {b.city}</span>
                  </span>
                  <span className="font-mono">
                    {formatMoney(b.sales)} <span className="text-success text-xs">{b.up}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-chip-bg overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(b.sales / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="font-semibold mb-3">Bitácora de actividad</h3>
          {log.length === 0 ? (
            <p className="text-muted text-sm">Sin actividad registrada aún.</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {log.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="font-mono text-muted shrink-0">{e.at}</span>
                  <span className="text-accent shrink-0">{e.actor}</span>
                  <span className="text-ink">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
