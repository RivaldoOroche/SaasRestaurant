import { useState } from "react";
import { useComprobantes, useSunatActions } from "@/data/hooks";
import { useConnection } from "@/store/connection";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/money";
import { ComprobanteDoc } from "./ComprobanteDoc";
import type { Comprobante, SunatStatus } from "@/data/model";

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
  const [ver, setVer] = useState<Comprobante | null>(null);

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
                <button
                  onClick={() => setVer(c)}
                  className="flex-1 flex items-center gap-4 min-w-0 text-left hover:opacity-80"
                  title="Ver comprobante"
                >
                  <span className="w-24 font-mono text-sm">{c.folio}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">{c.tipo}</span>
                      <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                    </span>
                    <span className="block text-muted text-xs truncate">
                      {c.reference}
                      {c.error ? ` · ${c.error}` : ""}
                    </span>
                  </span>
                  <span className="font-mono text-sm">{formatMoney(c.total)}</span>
                </button>
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

      {ver && (
        <Modal open onClose={() => setVer(null)} labelledBy="cpe-title" className="max-w-xl">
          <div className="p-5">
            <h2 id="cpe-title" className="text-lg font-bold mb-3">
              {ver.tipo} {ver.folio}
            </h2>
            <ComprobanteDoc
              tipo={ver.tipo}
              folio={ver.folio}
              issuedAt={new Date(ver.issuedAt)}
              emisor={{
                razonSocial: "LA HIGUERA S.A.C.",
                nombreComercial: "La Higuera",
                ruc: "20512345678",
                direccion: "Av. La Mar 1234, Miraflores, Lima",
              }}
              cliente={
                ver.tipo === "Factura"
                  ? { nombre: ver.buyerName || "—", docLabel: "RUC", docNum: ver.buyerRuc || "—" }
                  : { nombre: ver.buyerName || "CLIENTES VARIOS", docLabel: "DNI", docNum: "—" }
              }
              lines={[{ name: ver.reference || "Consumo", qty: 1, unitPrice: ver.subtotal, extraPrice: 0 }]}
              subtotal={ver.subtotal}
              igv={ver.igv}
              total={ver.total}
              taxRate={ver.subtotal > 0 ? ver.igv / ver.subtotal : 0.18}
              status={ver.status}
            />
            <div className="flex justify-end gap-2 mt-4 no-print">
              <Button variant="secondary" onClick={() => window.print()}>
                🖨 Imprimir
              </Button>
              <Button onClick={() => setVer(null)}>Cerrar</Button>
            </div>
          </div>
        </Modal>
      )}
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
