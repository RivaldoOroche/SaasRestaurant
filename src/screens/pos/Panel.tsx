import { useMemo } from "react";
import { Link } from "react-router-dom";
import { usePaidOrders, useOpenOrders, useKitchenTickets, useInventory, useMenuChanges } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { formatMoney, DEFAULT_TAX_RATE, round2 } from "@/lib/money";
import type { Order } from "@/data/model";

function total(o: Order): number {
  return round2(o.lines.reduce((s, l) => s + (l.unitPrice + l.extraPrice) * l.qty, 0) * (1 + DEFAULT_TAX_RATE));
}

export function Panel() {
  const { data: paid = [] } = usePaidOrders();
  const { data: open = [] } = useOpenOrders();
  const { data: tickets = [] } = useKitchenTickets();
  const { data: inventory = [] } = useInventory();
  const { data: changes = [] } = useMenuChanges();

  const sales = useMemo(() => round2(paid.reduce((s, o) => s + (o.paidTotal ?? total(o)), 0)), [paid]);
  const now = Date.now();
  const delayed = tickets.filter((t) => !t.done && (now - t.enteredAt) / 1000 >= 480).length;
  const lowStock = inventory.filter((i) => i.stock < i.par * 0.4).length;
  const pendingChanges = changes.filter((c) => c.status === "pendiente").length;

  return (
    <div className="p-6 mob:p-4 max-w-5xl">
      <ScreenHeader title="Panel" subtitle="Resumen operativo del turno" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Ventas hoy" value={formatMoney(sales)} to="/pos/reportes" />
        <Kpi label="Mesas activas" value={String(open.length)} to="/pos/cuentas" />
        <Kpi label="Comandas en retraso" value={String(delayed)} to="/pos/cocina" tone={delayed ? "warn" : undefined} />
        <Kpi label="Cambios pendientes" value={String(pendingChanges)} to="/pos/carta" tone={pendingChanges ? "warn" : undefined} />
      </div>

      <Card>
        <CardBody>
          <h3 className="font-semibold mb-3">Alertas de inventario</h3>
          {lowStock === 0 ? (
            <p className="text-muted text-sm">Todo el inventario está en nivel.</p>
          ) : (
            <ul className="space-y-1.5">
              {inventory
                .filter((i) => i.stock < i.par * 0.4)
                .map((i) => (
                  <li key={i.id} className="flex justify-between text-sm">
                    <span>{i.name}</span>
                    <span className="font-mono text-warning">
                      {i.stock} / {i.par} {i.unit}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <Link to="/pos/inventario" className="text-accent text-sm inline-block mt-3">
            Ir a Inventario →
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}

function Kpi({ label, value, to, tone }: { label: string; value: string; to: string; tone?: "warn" }) {
  return (
    <Link to={to}>
      <Card className="hover:border-accent/50 transition-colors">
        <CardBody>
          <p className="text-muted text-xs uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold font-mono mt-1 ${tone === "warn" ? "text-warning" : ""}`}>{value}</p>
        </CardBody>
      </Card>
    </Link>
  );
}
