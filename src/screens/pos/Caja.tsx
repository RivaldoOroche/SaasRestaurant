// Caja por turnos: abrir con fondo → registrar ingresos/egresos → cerrar
// contando por método. El esperado sale de las ventas del turno en esta
// sucursal; todo funciona sin internet y queda guardado con su historial.
import { useMemo, useState } from "react";
import { useBranches, useCashActions, useCashSessions, usePaidOrders } from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { useBranchStore } from "@/store/branch";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMoney, round2 } from "@/lib/money";
import { cn } from "@/lib/cn";
import { CASH_METHOD_LABEL, cashDifference, cashExpected, cashNetMovements } from "@/lib/cash";
import { EscPos } from "@/lib/escpos";
import { getPrinterConfig, printRaw } from "@/lib/printer";
import type { CashSession } from "@/data/model";

const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function Caja() {
  const { data: sessions = [] } = useCashSessions();
  const open = sessions.find((s) => s.status === "abierta") ?? null;
  const history = sessions.filter((s) => s.status === "cerrada");
  const [viewing, setViewing] = useState<CashSession | null>(null);
  const { close } = useCashActions();
  const [closeErr, setCloseErr] = useState<string | null>(null);

  // El cierre vive aquí (no en el panel de la caja abierta, que desaparece al
  // cerrarse) para poder mostrar el arqueo al terminar.
  function doClose(closed: CashSession) {
    setCloseErr(null);
    setViewing(closed);
    close.mutate(
      { sessionId: closed.id, counted: closed.counted ?? {}, notes: closed.notes ?? "", expected: closed.expected ?? {} },
      {
        onError: (e) => {
          setViewing(null);
          setCloseErr((e as Error).message);
        },
      },
    );
  }

  return (
    <div className="p-6 mob:p-4 max-w-3xl">
      <ScreenHeader title="Caja" subtitle="Apertura, movimientos y cierre del turno de esta sucursal" />
      {closeErr && (
        <p role="alert" className="mb-3 rounded-md bg-warning/10 text-warning px-3 py-2 text-sm">
          {closeErr}
        </p>
      )}
      {open ? <OpenShift session={open} onClose={doClose} closing={close.isPending} /> : <OpenForm />}

      <Card>
        <CardBody>
          <h3 className="font-semibold mb-3">Cierres anteriores</h3>
          {history.length === 0 ? (
            <p className="text-muted text-sm">Aún no hay cierres en esta sucursal.</p>
          ) : (
            <ul className="divide-y divide-border-soft">
              {history.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setViewing(s)} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left hover:opacity-80">
                    <span className="font-mono text-sm">{time(s.closedAt)}</span>
                    <span className="text-muted text-sm flex-1 min-w-[8rem]">
                      {s.openedBy} → {s.closedBy ?? "—"}
                    </span>
                    <span className="font-mono text-sm">{formatMoney(sum(s.expected))}</span>
                    <DiffBadge diff={s.difference ?? 0} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {viewing && <ArqueoModal session={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

const sum = (r?: Record<string, number> | null) => round2(Object.values(r ?? {}).reduce((s, v) => s + v, 0));

function OpenForm() {
  const { open } = useCashActions();
  const [float, setFloat] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const value = Number(float.replace(",", ".")) || 0;
  return (
    <Card className="mb-4 border-accent/40">
      <CardBody className="space-y-3">
        <div>
          <h3 className="font-semibold text-lg">Abrir caja</h3>
          <p className="text-muted text-sm">Cuenta el efectivo con el que empiezas (sencillo para dar vuelto).</p>
        </div>
        <MoneyInput value={float} onChange={setFloat} label="Fondo inicial" autoFocus />
        <div className="flex flex-wrap gap-2">
          {[0, 100, 200, 300, 500].map((v) => (
            <button key={v} onClick={() => setFloat(String(v))} className="rounded-full border border-border bg-chip-bg px-3 py-1 text-sm hover:border-accent/60">
              {formatMoney(v)}
            </button>
          ))}
        </div>
        {err && <p className="text-warning text-sm">{err}</p>}
        <Button
          size="lg"
          className="w-full"
          disabled={open.isPending}
          onClick={() => open.mutate(value, { onError: (e) => setErr((e as Error).message) })}
        >
          Abrir caja con {formatMoney(value)}
        </Button>
      </CardBody>
    </Card>
  );
}

function OpenShift({ session, onClose, closing: busyClosing }: { session: CashSession; onClose: (s: CashSession) => void; closing: boolean }) {
  const { data: orders = [] } = usePaidOrders();
  const { move } = useCashActions();
  const { session: auth } = useAuth();
  const expected = useMemo(() => cashExpected(session, orders), [session, orders]);
  const salesCash = round2(expected.efectivo - session.openingFloat - cashNetMovements(session));
  const [moving, setMoving] = useState<"ingreso" | "egreso" | null>(null);
  const [closing, setClosing] = useState(false);

  return (
    <>
      <Card className="mb-4 border-success/40">
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" /> Caja abierta
              </h3>
              <p className="text-muted text-sm">
                Desde {time(session.openedAt)} · {session.openedBy} · fondo {formatMoney(session.openingFloat)}
              </p>
            </div>
            <Button onClick={() => setClosing(true)}>Cerrar caja</Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(expected).map(([k, v]) => (
              <div key={k} className={cn("rounded-md p-3", k === "efectivo" ? "bg-accent/10 col-span-2 sm:col-span-1" : "bg-chip-bg")}>
                <p className="text-xs text-muted">{CASH_METHOD_LABEL[k] ?? k}</p>
                <p className="font-mono font-bold text-lg">{formatMoney(v)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            Efectivo esperado = fondo {formatMoney(session.openingFloat)} + ventas en efectivo {formatMoney(salesCash)}{" "}
            {cashNetMovements(session) >= 0 ? "+" : "−"} movimientos {formatMoney(Math.abs(cashNetMovements(session)))}.
          </p>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h4 className="font-semibold text-sm">Movimientos de efectivo</h4>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setMoving("ingreso")}>
                  ＋ Ingreso
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setMoving("egreso")}>
                  − Egreso / gasto
                </Button>
              </div>
            </div>
            {session.movements.length === 0 ? (
              <p className="text-muted text-xs">Registra aquí gastos pagados con la caja, retiros o sencillo agregado.</p>
            ) : (
              <ul className="text-sm divide-y divide-border-soft">
                {session.movements.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-1.5">
                    <span className="font-mono text-muted text-xs">{time(m.at)}</span>
                    <span className="flex-1 truncate">{m.reason || (m.kind === "ingreso" ? "Ingreso" : "Egreso")}</span>
                    <span className={cn("font-mono", m.kind === "ingreso" ? "text-success" : "text-warning")}>
                      {m.kind === "ingreso" ? "+" : "−"}
                      {formatMoney(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>

      {moving && (
        <MovementModal
          kind={moving}
          busy={move.isPending}
          onClose={() => setMoving(null)}
          onSave={(amount, reason) =>
            move.mutate({ sessionId: session.id, kind: moving, amount, reason }, { onSuccess: () => setMoving(null) })
          }
        />
      )}
      {closing && (
        <CloseModal
          expected={expected}
          busy={busyClosing}
          onClose={() => setClosing(false)}
          onConfirm={(counted, notes) => {
            setClosing(false);
            onClose({
              ...session,
              status: "cerrada",
              closedAt: new Date().toISOString(),
              closedBy: auth?.staff?.name ?? auth?.userEmail ?? "POS",
              expected,
              counted,
              difference: cashDifference(expected, counted),
              notes,
            });
          }}
        />
      )}
    </>
  );
}

function MovementModal({
  kind,
  busy,
  onClose,
  onSave,
}: {
  kind: "ingreso" | "egreso";
  busy: boolean;
  onClose: () => void;
  onSave: (amount: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const value = Number(amount.replace(",", ".")) || 0;
  const suggestions = kind === "egreso" ? ["Compra de insumos", "Pago a proveedor", "Retiro del dueño", "Gas / servicios"] : ["Sencillo adicional", "Devolución", "Otro ingreso"];
  return (
    <Modal open onClose={onClose} labelledBy="mov-title">
      <div className="p-5 space-y-3">
        <h2 id="mov-title" className="text-lg font-bold">
          {kind === "ingreso" ? "Ingreso de efectivo" : "Egreso de efectivo"}
        </h2>
        <MoneyInput value={amount} onChange={setAmount} label="Monto" autoFocus />
        <label className="block">
          <span className="text-xs text-muted">Motivo</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => setReason(s)} className="rounded-full border border-border bg-chip-bg px-3 py-1 text-xs hover:border-accent/60">
              {s}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={value <= 0 || busy} onClick={() => onSave(value, reason.trim())}>
            Registrar {formatMoney(value)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CloseModal({
  expected,
  busy,
  onClose,
  onConfirm,
}: {
  expected: Record<string, number>;
  busy: boolean;
  onClose: () => void;
  onConfirm: (counted: Record<string, number>, notes: string) => void;
}) {
  // Los pagos digitales se precargan con lo esperado (se verifican en su app);
  // el efectivo se cuenta a mano.
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, k === "efectivo" ? "" : String(v)])),
  );
  const [notes, setNotes] = useState("");
  const counted = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, Number(v.replace(",", ".")) || 0]));
  const diff = cashDifference(expected, counted);
  const cashTyped = inputs.efectivo.trim() !== "";
  return (
    <Modal open onClose={onClose} labelledBy="close-title">
      <div className="p-5 space-y-3">
        <h2 id="close-title" className="text-lg font-bold">
          Cerrar caja
        </h2>
        <p className="text-sm text-muted">Cuenta el efectivo del cajón y confirma los pagos digitales en sus apps.</p>
        <div className="space-y-2">
          {Object.entries(expected).map(([k, v]) => {
            const d = round2((counted[k] ?? 0) - v);
            return (
              <div key={k} className="grid grid-cols-[1fr_8rem] items-center gap-2">
                <div>
                  <p className="text-sm font-medium">{CASH_METHOD_LABEL[k] ?? k}</p>
                  <p className="text-xs text-muted">
                    Esperado {formatMoney(v)}
                    {(k !== "efectivo" || cashTyped) && d !== 0 && (
                      <span className={d > 0 ? "text-success" : "text-warning"}> · {d > 0 ? "sobra" : "falta"} {formatMoney(Math.abs(d))}</span>
                    )}
                  </p>
                </div>
                <MoneyInput value={inputs[k]} onChange={(val) => setInputs({ ...inputs, [k]: val })} label={`Contado ${CASH_METHOD_LABEL[k] ?? k}`} compact autoFocus={k === "efectivo"} />
              </div>
            );
          })}
        </div>
        <div className={cn("flex justify-between rounded-md px-3 py-2 text-sm font-semibold", diff === 0 ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
          <span>{diff === 0 ? "Cuadra exacto" : diff > 0 ? "Sobra" : "Falta"}</span>
          <span className="font-mono">{formatMoney(Math.abs(diff))}</span>
        </div>
        <label className="block">
          <span className="text-xs text-muted">Observaciones (opcional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Seguir con la caja abierta
          </Button>
          <Button disabled={!cashTyped || busy} onClick={() => onConfirm(counted, notes.trim())}>
            {busy ? "Cerrando…" : "Confirmar cierre"}
          </Button>
        </div>
        {!cashTyped && <p className="text-xs text-muted text-right">Ingresa el efectivo contado para cerrar.</p>}
      </div>
    </Modal>
  );
}

function ArqueoModal({ session, onClose }: { session: CashSession; onClose: () => void }) {
  const { data: branches = [] } = useBranches();
  const branchId = useBranchStore((s) => s.branchId);
  const branch = branches.find((b) => b.id === (session.branchId ?? branchId))?.name ?? "";
  const expected = session.expected ?? {};
  const counted = session.counted ?? {};
  const [err, setErr] = useState<string | null>(null);

  async function printDirect() {
    setErr(null);
    const cfg = getPrinterConfig();
    const p = new EscPos(cfg.width);
    p.align("center").bold(true).line("ARQUEO DE CAJA").bold(false).line(branch);
    p.line(`${time(session.openedAt)} -> ${time(session.closedAt)}`).align("left").rule();
    p.pair("Fondo inicial", formatMoney(session.openingFloat));
    for (const m of session.movements) p.pair(`${m.kind === "ingreso" ? "+" : "-"} ${m.reason || m.kind}`, formatMoney(m.amount));
    p.rule();
    for (const k of Object.keys(expected)) {
      p.line(CASH_METHOD_LABEL[k] ?? k);
      p.pair("  Esperado", formatMoney(expected[k])).pair("  Contado", formatMoney(counted[k] ?? 0));
    }
    p.rule().bold(true).pair("DIFERENCIA", formatMoney(session.difference ?? 0)).bold(false);
    p.line(`Abrio: ${session.openedBy}  Cerro: ${session.closedBy ?? ""}`);
    if (session.notes) p.wrap(`Obs: ${session.notes}`);
    p.feed(2).line("Firma: ______________________");
    try {
      await printRaw(p.cut().build());
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="arq-title" className="max-w-md">
      <div className="p-5">
        <div className="print-area space-y-2">
          <h2 id="arq-title" className="text-lg font-bold">
            Arqueo de caja
          </h2>
          <p className="text-sm text-muted">
            {branch} · {time(session.openedAt)} → {time(session.closedAt)}
          </p>
          <p className="text-sm">
            Abrió {session.openedBy} con {formatMoney(session.openingFloat)} · cerró {session.closedBy ?? "—"}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs">
                <th className="text-left font-normal">Método</th>
                <th className="text-right font-normal">Esperado</th>
                <th className="text-right font-normal">Contado</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(expected).map((k) => (
                <tr key={k}>
                  <td>{CASH_METHOD_LABEL[k] ?? k}</td>
                  <td className="text-right font-mono">{formatMoney(expected[k])}</td>
                  <td className="text-right font-mono">{formatMoney(counted[k] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between font-semibold pt-1 border-t border-border">
            <span>Diferencia</span>
            <DiffBadge diff={session.difference ?? 0} />
          </div>
          {session.movements.length > 0 && (
            <p className="text-xs text-muted">
              Movimientos: {session.movements.map((m) => `${m.kind === "ingreso" ? "+" : "−"}${formatMoney(m.amount)} ${m.reason}`).join(" · ")}
            </p>
          )}
          {session.notes && <p className="text-xs">Observaciones: {session.notes}</p>}
        </div>
        {err && <p className="text-warning text-sm mt-2">{err}</p>}
        <div className="flex flex-wrap justify-end gap-2 mt-4 no-print">
          {getPrinterConfig().kind !== "none" && (
            <Button variant="secondary" onClick={printDirect}>
              🧾 Impresora térmica
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            🖨 Imprimir
          </Button>
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    </Modal>
  );
}

function DiffBadge({ diff }: { diff: number }) {
  return (
    <span className={cn("font-mono text-sm font-semibold", diff === 0 ? "text-success" : diff > 0 ? "text-accent" : "text-warning")}>
      {diff === 0 ? "cuadra" : `${diff > 0 ? "+" : "−"}${formatMoney(Math.abs(diff))}`}
    </span>
  );
}

function MoneyInput({
  value,
  onChange,
  label,
  autoFocus,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  return (
    <label className="block">
      {!compact && <span className="text-xs text-muted">{label}</span>}
      <span className="flex items-center rounded-md bg-chip-bg border border-border focus-within:border-accent">
        <span className="pl-3 text-muted text-sm">S/</span>
        <input
          aria-label={label}
          autoFocus={autoFocus}
          inputMode="decimal"
          value={value}
          placeholder="0.00"
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
          className={cn("w-full bg-transparent px-2 font-mono outline-none", compact ? "py-1.5 text-sm text-right" : "py-2.5 text-lg")}
        />
      </span>
    </label>
  );
}
