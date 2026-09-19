import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { computeCheckout, equalSplit } from "@/lib/checkout";
import { useOrderActions } from "@/data/hooks";
import { cn } from "@/lib/cn";
import type { Order } from "@/data/model";

type Stage = "cuenta" | "pago" | "doc";
const DISCOUNTS = [0, 0.1, 0.15, 1];
const TIPS = [0, 0.1, 0.15, 0.18];
const METHODS = [
  { key: "efectivo", label: "Efectivo" },
  { key: "tarjeta", label: "Tarjeta" },
  { key: "transferencia", label: "Transferencia" },
];

export function CobroModal({
  open,
  onClose,
  order,
  amount,
  taxRate,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  amount: number;
  taxRate: number;
  onPaid: () => void;
}) {
  const actions = useOrderActions(order.tableId);
  const [stage, setStage] = useState<Stage>("cuenta");
  const [discountPct, setDiscountPct] = useState(0);
  const [tipPct, setTipPct] = useState(0);
  const [splitN, setSplitN] = useState(1);
  const [method, setMethod] = useState("efectivo");

  const result = useMemo(
    () => computeCheckout({ amount, taxRate, discountPct, tipPct }),
    [amount, taxRate, discountPct, tipPct],
  );
  const perPerson = equalSplit(result.grand, splitN);

  function reset() {
    setStage("cuenta");
    setDiscountPct(0);
    setTipPct(0);
    setSplitN(1);
    setMethod("efectivo");
  }

  function close() {
    reset();
    onClose();
  }

  async function pay() {
    await actions.payOrder.mutateAsync({ orderId: order.id, method, total: result.grand });
    setStage("doc");
  }

  const methodLabel = METHODS.find((m) => m.key === method)?.label ?? method;

  return (
    <Modal open={open} onClose={close} labelledBy="cobro-title">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 id="cobro-title" className="text-xl font-bold">
            {stage === "doc" ? "Comprobante" : "Cobrar · Mesa " + order.tableLabel}
          </h2>
          <span className="font-mono text-lg font-bold text-accent">{formatMoney(result.grand)}</span>
        </div>

        {stage === "cuenta" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-alt border border-border-soft p-3 space-y-1">
              <Row label="Subtotal" value={formatMoney(result.subtotal)} />
              <Row label={`IGV (${Math.round(taxRate * 100)}%)`} value={formatMoney(result.igv)} />
              {result.discAmt > 0 && <Row label="Descuento" value={"− " + formatMoney(result.discAmt)} />}
              {result.tipAmt > 0 && <Row label="Propina" value={formatMoney(result.tipAmt)} />}
              <div className="flex justify-between pt-1 font-bold">
                <span>Total</span>
                <span className="font-mono">{formatMoney(result.grand)}</span>
              </div>
            </div>

            <Field label="Descuento">
              <div className="flex gap-2">
                {DISCOUNTS.map((d) => (
                  <Pill key={d} active={discountPct === d} onClick={() => setDiscountPct(d)}>
                    {d === 1 ? "Cortesía" : `${Math.round(d * 100)}%`}
                  </Pill>
                ))}
              </div>
            </Field>

            <Field label="Propina">
              <div className="flex gap-2">
                {TIPS.map((t) => (
                  <Pill key={t} active={tipPct === t} onClick={() => setTipPct(t)}>
                    {Math.round(t * 100)}%
                  </Pill>
                ))}
              </div>
            </Field>

            <Field label="Dividir cuenta">
              <div className="flex items-center gap-3">
                <Stepper value={splitN} onDec={() => setSplitN(Math.max(1, splitN - 1))} onInc={() => setSplitN(Math.min(order.seats || 8, splitN + 1))} />
                {splitN > 1 && (
                  <span className="text-sm text-muted">
                    {formatMoney(perPerson)} <span className="opacity-70">por persona</span>
                  </span>
                )}
              </div>
            </Field>

            <Field label="Método de pago">
              <div className="flex gap-2">
                {METHODS.map((m) => (
                  <Pill key={m.key} active={method === m.key} onClick={() => setMethod(m.key)}>
                    {m.label}
                  </Pill>
                ))}
              </div>
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={close}>
                Cancelar
              </Button>
              <Button onClick={() => setStage("pago")}>Registrar pago</Button>
            </div>
          </div>
        )}

        {stage === "pago" && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-4xl mb-2">💳</div>
              <p className="font-semibold">Cobrar {formatMoney(result.grand)}</p>
              <p className="text-muted text-sm">Método: {methodLabel}</p>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStage("cuenta")}>
                ← Volver
              </Button>
              <Button onClick={pay} disabled={actions.payOrder.isPending}>
                Confirmar pago y emitir
              </Button>
            </div>
          </div>
        )}

        {stage === "doc" && (
          <div>
            <div className="print-area rounded-lg border border-border-soft bg-surface-alt p-4 font-mono text-sm">
              <div className="text-center mb-3">
                <p className="font-bold text-base">La Higuera</p>
                <p className="text-xs text-muted">Av. La Mar 1234, Miraflores, Lima</p>
                <p className="text-xs text-muted">RUC 20512345678</p>
              </div>
              <div className="border-t border-dashed border-border my-2" />
              {order.lines.map((l) => (
                <div key={l.id} className="flex justify-between">
                  <span>
                    {l.qty}× {l.name}
                  </span>
                  <span>{formatMoney((l.unitPrice + l.extraPrice) * l.qty)}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-border my-2" />
              <Row label="Subtotal" value={formatMoney(result.subtotal)} />
              <Row label={`IGV (${Math.round(taxRate * 100)}%)`} value={formatMoney(result.igv)} />
              {result.discAmt > 0 && <Row label="Descuento" value={"− " + formatMoney(result.discAmt)} />}
              {result.tipAmt > 0 && <Row label="Propina" value={formatMoney(result.tipAmt)} />}
              <div className="flex justify-between font-bold mt-1">
                <span>TOTAL</span>
                <span>{formatMoney(result.grand)}</span>
              </div>
              <p className="text-xs text-muted mt-2">Pagado con {methodLabel}</p>
              <p className="text-[10px] text-muted mt-3 text-center">
                Comprobante de consumo · el comprobante electrónico SUNAT se emite en la Fase 3.
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-4 no-print">
              <Button variant="secondary" onClick={() => window.print()}>
                🖨 Imprimir
              </Button>
              <Button
                onClick={() => {
                  reset();
                  onPaid();
                }}
              >
                Listo
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm border transition-colors",
        active ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Stepper({ value, onDec, onInc }: { value: number; onDec: () => void; onInc: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onDec} className="h-8 w-8 rounded-md bg-chip-bg border border-border">
        −
      </button>
      <span className="w-8 text-center">{value}</span>
      <button onClick={onInc} className="h-8 w-8 rounded-md bg-chip-bg border border-border">
        +
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
