import { useMemo, useState } from "react";
import { usePaidOrders } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatMoney, round2 } from "@/lib/money";
import { cn } from "@/lib/cn";

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export function Caja() {
  const { data: paid = [] } = usePaidOrders();
  const [counted, setCounted] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  const byMethod = useMemo(() => {
    const m: Record<string, number> = { efectivo: 0, yape: 0, plin: 0, tarjeta: 0, transferencia: 0 };
    for (const o of paid) {
      const key = o.paidMethod ?? "efectivo";
      m[key] = round2((m[key] ?? 0) + (o.paidTotal ?? 0));
    }
    return m;
  }, [paid]);

  const expectedCash = byMethod.efectivo ?? 0;
  const countedValue = counted ?? expectedCash;
  const diff = round2(countedValue - expectedCash);

  return (
    <div className="p-6 max-w-2xl">
      <ScreenHeader title="Corte de caja" subtitle="Arqueo del turno · esperado por método vs. contado" />

      <Card className="mb-4">
        <CardBody>
          <h3 className="font-semibold mb-3">Esperado por método</h3>
          <div className="space-y-2">
            {Object.entries(byMethod).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-muted">{METHOD_LABEL[k] ?? k}</span>
                <span className="font-mono">{formatMoney(v)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-border font-bold">
              <span>Total esperado</span>
              <span className="font-mono">
                {formatMoney(round2(Object.values(byMethod).reduce((s, v) => s + v, 0)))}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="font-semibold mb-1">Efectivo contado</h3>
          <p className="text-muted text-xs mb-3">Esperado en efectivo: {formatMoney(expectedCash)}</p>
          <div className="flex items-center gap-3 mb-4">
            <Button variant="secondary" onClick={() => setCounted(round2(countedValue - 50))}>
              − 50
            </Button>
            <span className="font-mono text-lg w-32 text-center">{formatMoney(countedValue)}</span>
            <Button variant="secondary" onClick={() => setCounted(round2(countedValue + 50))}>
              + 50
            </Button>
          </div>
          <div
            className={cn(
              "flex justify-between items-center rounded-md px-3 py-2 text-sm mb-4",
              diff === 0 ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
            )}
          >
            <span>Diferencia</span>
            <span className="font-mono font-semibold">
              {diff > 0 ? "+" : ""}
              {formatMoney(diff)}
            </span>
          </div>
          {closed ? (
            <p className="text-success text-sm text-center">Caja cerrada ✓</p>
          ) : (
            <Button className="w-full" onClick={() => setClosed(true)}>
              Cerrar caja e imprimir arqueo
            </Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
