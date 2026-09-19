import { useComprobantes, useSunatActions } from "@/data/hooks";
import { useConnection } from "@/store/connection";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";
import type { SunatStatus } from "@/data/model";

const STATUS: Record<SunatStatus, { label: string; tone: "success" | "warning" | "neutral" | "accent" }> = {
  aceptada: { label: "Aceptada", tone: "success" },
  encola: { label: "En cola", tone: "warning" },
  enviando: { label: "Enviando", tone: "accent" },
  rechazada: { label: "Rechazada", tone: "neutral" },
};

export function Sunat() {
  const { data: comprobantes = [] } = useComprobantes();
  const { sync, retry } = useSunatActions();
  const online = useConnection((s) => s.online);

  const accepted = comprobantes.filter((c) => c.status === "aceptada").length;
  const queued = comprobantes.filter((c) => c.status === "encola").length;
  const rejected = comprobantes.filter((c) => c.status === "rechazada").length;

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader
        title="Monitor SUNAT"
        subtitle="Comprobantes electrónicos · boletas y facturas"
        actions={
          <Button variant="secondary" onClick={() => sync.mutate(online)} disabled={!online || queued === 0}>
            ↻ Sincronizar SUNAT
          </Button>
        }
      />

      {!online && (
        <div className="rounded-md bg-warning/10 text-warning px-4 py-2 text-sm mb-4">
          Sin conexión — los comprobantes se registran localmente y se enviarán al reconectar.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Counter label="Aceptadas" value={accepted} tone="success" />
        <Counter label="En cola" value={queued} tone="warning" />
        <Counter label="Rechazadas" value={rejected} tone="neutral" />
      </div>

      <Card>
        {comprobantes.length === 0 ? (
          <p className="p-10 text-center text-muted">Aún no se han emitido comprobantes.</p>
        ) : (
          <div className="divide-y divide-border-soft">
            {comprobantes.map((c) => (
              <div key={c.id} className="flex items-center gap-4 p-3">
                <div className="w-24 font-mono text-sm">{c.folio}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.tipo}</span>
                    <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                  </div>
                  <p className="text-muted text-xs">
                    {c.reference}
                    {c.error ? ` · ${c.error}` : ""}
                  </p>
                </div>
                <span className="font-mono text-sm">{formatMoney(c.total)}</span>
                {c.status === "rechazada" && (
                  <Button size="sm" variant="secondary" disabled={!online} onClick={() => retry.mutate({ id: c.id, online })}>
                    Reintentar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "neutral" }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-neutral";
  return (
    <Card className="p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-muted text-xs">{label}</p>
    </Card>
  );
}
