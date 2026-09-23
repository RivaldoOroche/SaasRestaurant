import { useState } from "react";
import { useChargeProposals, usePlatformActions } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { ChargeProposal, ChargeStatus } from "@/data/platform/model";

const STATUS_TONE: Record<ChargeStatus, "neutral" | "warning" | "accent" | "success"> = {
  pendiente: "warning",
  aprobada: "accent",
  cobrada: "success",
  rechazada: "neutral",
  fallida: "warning",
};
const STATUS_LABEL: Record<ChargeStatus, string> = {
  pendiente: "Pendiente de aprobar",
  aprobada: "Aprobada",
  cobrada: "Cobrada",
  rechazada: "Rechazada",
  fallida: "Falló el cobro",
};

export function Cobros() {
  const { data: charges = [] } = useChargeProposals();
  const { runDunning } = usePlatformActions();
  const pending = charges.filter((c) => c.status === "pendiente" || c.status === "aprobada" || c.status === "fallida");
  const history = charges.filter((c) => c.status === "cobrada" || c.status === "rechazada");

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader
        title="Cobros de suscripción"
        subtitle="Toda cobranza pasa por aprobación: valida los datos de la factura antes de cobrar."
        actions={
          <Button onClick={() => runDunning.mutate()} disabled={runDunning.isPending}>
            {runDunning.isPending ? "Procesando…" : "▶ Correr dunning"}
          </Button>
        }
      />

      <p className="text-xs uppercase tracking-wide text-muted mb-2">Pendientes de aprobación</p>
      {pending.length === 0 ? (
        <Card className="p-6 text-center text-muted text-sm">
          No hay cobros por aprobar. Usa <b>Correr dunning</b> para proponer los cobros del periodo.
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((c) => (
            <ProposalCard key={c.id} c={c} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-wide text-muted mt-6 mb-2">Historial reciente</p>
          <Card className="divide-y divide-border-soft">
            {history.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{c.tenant}</p>
                  <p className="text-muted text-xs">
                    {c.plan} · {c.period} {c.note ? `· ${c.note}` : ""}
                  </p>
                </div>
                <span className="font-mono">{formatMoney(c.total)}</span>
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function ProposalCard({ c }: { c: ChargeProposal }) {
  const { updateChargeProposal, approveCharge, rejectCharge } = usePlatformActions();
  const [ruc, setRuc] = useState(c.ruc ?? "");
  const [razon, setRazon] = useState(c.razonSocial ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const rucValid = ruc.replace(/\D/g, "").length === 11;
  const dirty = ruc !== (c.ruc ?? "") || razon !== (c.razonSocial ?? "");

  async function approve() {
    setErr(null);
    try {
      if (dirty) await updateChargeProposal.mutateAsync({ id: c.id, patch: { ruc, razonSocial: razon } });
      await approveCharge.mutateAsync({ id: c.id });
    } catch (e) {
      setErr((e as Error).message ?? "No se pudo aprobar el cobro");
    }
  }

  return (
    <Card className={cn("p-4", c.status === "fallida" && "border-warning/50")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{c.tenant}</p>
            <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
          </div>
          <p className="text-muted text-xs">
            {c.ownerName} · plan {c.plan} · periodo {c.period}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono font-bold">{formatMoney(c.total)}</p>
          <p className="text-muted text-[11px]">
            base {formatMoney(c.base)} · IGV {formatMoney(c.igv)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <label className="text-xs">
          <span className="text-muted">RUC a facturar</span>
          <input
            value={ruc}
            onChange={(e) => setRuc(e.target.value)}
            placeholder="20xxxxxxxxx"
            className={cn(
              "mt-1 w-full rounded-md bg-chip-bg border px-2 py-1.5 text-sm font-mono",
              ruc && !rucValid ? "border-warning" : "border-border",
            )}
          />
        </label>
        <label className="text-xs">
          <span className="text-muted">Razón social</span>
          <input
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
            placeholder="Razón social del cliente"
            className="mt-1 w-full rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {ruc && !rucValid && <p className="text-warning text-[11px] mt-1">El RUC debe tener 11 dígitos.</p>}
      {err && <p className="text-warning text-xs mt-1">{err}</p>}

      {!rejecting ? (
        <div className="flex justify-end gap-2 mt-3">
          <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
            Rechazar
          </Button>
          <Button
            size="sm"
            onClick={approve}
            disabled={!rucValid || !razon.trim() || approveCharge.isPending || updateChargeProposal.isPending}
          >
            {approveCharge.isPending ? "Cobrando…" : "Aprobar y cobrar"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo del rechazo"
            className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm"
          />
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!reason.trim() || rejectCharge.isPending}
            onClick={() => rejectCharge.mutate({ id: c.id, reason })}
          >
            Confirmar rechazo
          </Button>
        </div>
      )}
    </Card>
  );
}
