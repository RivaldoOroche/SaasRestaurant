import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useOpenOrders } from "@/data/hooks";
import { usePos } from "@/store/pos";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { formatMoney, DEFAULT_TAX_RATE, round2 } from "@/lib/money";
import type { Order } from "@/data/model";

function orderTotal(o: Order): number {
  const sub = o.lines.reduce((s, l) => s + (l.unitPrice + l.extraPrice) * l.qty, 0);
  return round2(sub * (1 + DEFAULT_TAX_RATE));
}

function elapsed(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function Cuentas() {
  const { data: orders = [] } = useOpenOrders();
  const navigate = useNavigate();
  const setActiveTable = usePos((s) => s.setActiveTable);

  const total = useMemo(() => round2(orders.reduce((s, o) => s + orderTotal(o), 0)), [orders]);

  function open(o: Order) {
    if (o.tableId) {
      setActiveTable(o.tableId);
      navigate("/pos/pedido");
    }
  }

  return (
    <div className="p-6 mob:p-4 max-w-5xl">
      <ScreenHeader
        title="Cuentas"
        subtitle="Cuentas abiertas en el piso · toca una para cobrar"
        actions={
          <div className="text-right">
            <p className="text-xs text-muted">Por cobrar</p>
            <p className="font-mono font-bold text-lg">{formatMoney(total)}</p>
          </div>
        }
      />

      {orders.length === 0 ? (
        <Card className="p-10 text-center text-muted">No hay cuentas abiertas.</Card>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => open(o)}
              className="w-full text-left rounded-lg border border-border bg-surface hover:border-accent/50 transition-colors p-4 flex items-center gap-4"
            >
              <div className="h-11 w-11 rounded-md bg-chip-bg grid place-items-center font-bold text-sm shrink-0">
                M{o.tableLabel}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Mesa {o.tableLabel}</p>
                <p className="text-muted text-xs">
                  {o.zone} · {o.lines.length} ítems · {elapsed(o.openedAt)}
                </p>
              </div>
              <span className="font-mono font-semibold">{formatMoney(orderTotal(o))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
