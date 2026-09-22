import { useActivityLog, useBranchSales } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { formatMoney } from "@/lib/money";

export function Sucursales() {
  const { data: log = [] } = useActivityLog();
  const { data: branches = [] } = useBranchSales();
  const max = Math.max(1, ...branches.map((b) => b.sales));
  const totalSales = Math.round(branches.reduce((s, b) => s + b.sales, 0) * 100) / 100;

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader title="Dueño" subtitle="Comparativa de sucursales y bitácora de actividad" />

      <Card className="mb-4">
        <CardBody>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-semibold">Ventas por sucursal</h3>
            <span className="text-sm text-muted">
              Total <span className="font-mono text-ink">{formatMoney(totalSales)}</span>
            </span>
          </div>
          {branches.length === 0 ? (
            <p className="text-muted text-sm">Aún no hay ventas registradas.</p>
          ) : (
            <div className="space-y-3">
              {branches.map((b) => (
                <div key={b.branchId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">
                      {b.name} <span className="text-muted">· {b.city}</span>
                    </span>
                    <span className="font-mono">
                      {formatMoney(b.sales)} <span className="text-muted text-xs">· {b.orders} ped.</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-chip-bg overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(b.sales / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
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
