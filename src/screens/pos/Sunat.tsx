import { useState } from "react";
import { useComprobantes, useSunatActions } from "@/data/hooks";
import { useConnection } from "@/store/connection";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/money";
import { printThermal } from "@/lib/printThermal";
import { ComprobanteDoc } from "./ComprobanteDoc";
import type { Comprobante, ComprobanteTipo, ResumenDiario, BajaResult, SunatStatus } from "@/data/model";

const STATUS: Record<SunatStatus, { label: string; tone: "success" | "warning" | "neutral" | "accent" }> = {
  aceptada: { label: "Aceptada", tone: "success" },
  encola: { label: "En cola", tone: "warning" },
  enviando: { label: "Enviando", tone: "accent" },
  rechazada: { label: "Rechazada", tone: "neutral" },
};

const TIPO_LABEL: Record<ComprobanteTipo, string> = {
  Boleta: "Boleta",
  Factura: "Factura",
  NotaCredito: "Nota de crédito",
};

// Motivos frecuentes (catálogo 09 SUNAT).
const MOTIVOS = [
  "Anulación de la operación",
  "Anulación por error en el RUC",
  "Corrección por error en la descripción",
  "Devolución total",
  "Devolución por ítem",
  "Descuento global",
];

export function Sunat() {
  const { data: comprobantes = [] } = useComprobantes();
  const { sync, retry, notaCredito, resumen, baja } = useSunatActions();
  const online = useConnection((s) => s.online);
  const [ver, setVer] = useState<Comprobante | null>(null);
  const [ncFor, setNcFor] = useState<Comprobante | null>(null);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [resumenRes, setResumenRes] = useState<ResumenDiario | null>(null);
  const [bajaFor, setBajaFor] = useState<Comprobante | null>(null);
  const [bajaMotivo, setBajaMotivo] = useState(MOTIVOS[0]);
  const [bajaRes, setBajaRes] = useState<BajaResult | null>(null);

  const accepted = comprobantes.filter((c) => c.status === "aceptada").length;
  const queued = comprobantes.filter((c) => c.status === "encola").length;
  const rejected = comprobantes.filter((c) => c.status === "rechazada").length;

  function emitirNC() {
    if (!ncFor) return;
    notaCredito.mutate(
      { originalId: ncFor.id, motivo, online },
      { onSuccess: () => setNcFor(null) },
    );
  }

  function enviarResumen() {
    resumen.mutate(online, { onSuccess: (r) => setResumenRes(r) });
  }

  function comunicarBaja() {
    if (!bajaFor) return;
    baja.mutate(
      { comprobanteId: bajaFor.id, motivo: bajaMotivo, online },
      { onSuccess: (r) => { setBajaRes(r); setBajaFor(null); } },
    );
  }

  return (
    <div className="p-6 mob:p-4 max-w-4xl">
      <ScreenHeader
        title="Monitor SUNAT"
        subtitle="Comprobantes electrónicos · boletas, facturas y notas de crédito"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={enviarResumen} disabled={resumen.isPending}>
              📄 Resumen diario
            </Button>
            <Button variant="secondary" onClick={() => sync.mutate(online)} disabled={!online || queued === 0}>
              ↻ Sincronizar SUNAT
            </Button>
          </div>
        }
      />

      {!online && (
        <div className="rounded-md bg-warning/10 text-warning px-4 py-2 text-sm mb-4">
          Sin conexión — los comprobantes se registran localmente y se enviarán al reconectar.
        </div>
      )}

      {resumenRes && (
        <div className="rounded-md bg-accent/10 text-accent px-4 py-2 text-sm mb-4 flex items-center justify-between gap-3">
          <span>
            Resumen diario <span className="font-mono">{resumenRes.folio}</span> · {resumenRes.count} boleta(s) ·{" "}
            {formatMoney(resumenRes.total)} · {STATUS[resumenRes.status].label}
          </span>
          <button onClick={() => setResumenRes(null)} className="text-xs underline shrink-0">
            Cerrar
          </button>
        </div>
      )}

      {bajaRes && (
        <div className="rounded-md bg-warning/10 text-warning px-4 py-2 text-sm mb-4 flex items-center justify-between gap-3">
          <span>
            Comunicación de baja <span className="font-mono">{bajaRes.folio}</span> · anula{" "}
            <span className="font-mono">{bajaRes.refFolio}</span> · {STATUS[bajaRes.status].label}
          </span>
          <button onClick={() => setBajaRes(null)} className="text-xs underline shrink-0">
            Cerrar
          </button>
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
                      <span className="text-sm font-medium">{TIPO_LABEL[c.tipo]}</span>
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
                {c.tipo !== "NotaCredito" && c.status === "aceptada" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setMotivo(MOTIVOS[0]);
                      setNcFor(c);
                    }}
                  >
                    Nota de crédito
                  </Button>
                )}
                {c.tipo === "Factura" && c.status === "aceptada" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setBajaMotivo(MOTIVOS[0]);
                      setBajaFor(c);
                    }}
                  >
                    Baja
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Emitir nota de crédito */}
      {ncFor && (
        <Modal open onClose={() => setNcFor(null)} labelledBy="nc-title" className="max-w-md">
          <div className="p-5">
            <h2 id="nc-title" className="text-lg font-bold mb-1">
              Nota de crédito
            </h2>
            <p className="text-muted text-sm mb-4">
              Anula {TIPO_LABEL[ncFor.tipo]} <span className="font-mono">{ncFor.folio}</span> ·{" "}
              {formatMoney(ncFor.total)}
            </p>
            <label className="text-xs uppercase tracking-wide text-muted mb-1.5 block">Motivo</label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm mb-4"
            >
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setNcFor(null)}>
                Cancelar
              </Button>
              <Button onClick={emitirNC} disabled={notaCredito.isPending}>
                Emitir nota de crédito
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Comunicar baja (facturas) */}
      {bajaFor && (
        <Modal open onClose={() => setBajaFor(null)} labelledBy="baja-title" className="max-w-md">
          <div className="p-5">
            <h2 id="baja-title" className="text-lg font-bold mb-1">
              Comunicación de baja
            </h2>
            <p className="text-muted text-sm mb-4">
              Anula ante SUNAT la Factura <span className="font-mono">{bajaFor.folio}</span> ·{" "}
              {formatMoney(bajaFor.total)}
            </p>
            <label className="text-xs uppercase tracking-wide text-muted mb-1.5 block">Motivo</label>
            <select
              value={bajaMotivo}
              onChange={(e) => setBajaMotivo(e.target.value)}
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm mb-4"
            >
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBajaFor(null)}>
                Cancelar
              </Button>
              <Button onClick={comunicarBaja} disabled={baja.isPending}>
                Comunicar baja
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Ver comprobante */}
      {ver && (
        <Modal open onClose={() => setVer(null)} labelledBy="cpe-title" className="max-w-xl">
          <div className="p-5">
            <h2 id="cpe-title" className="text-lg font-bold mb-3">
              {TIPO_LABEL[ver.tipo]} {ver.folio}
            </h2>
            <ComprobanteDoc
              tipo={ver.tipo}
              folio={ver.folio}
              issuedAt={new Date(ver.issuedAt)}
              refFolio={ver.refFolio}
              motivo={ver.motivo}
              emisor={{
                razonSocial: "LA HIGUERA S.A.C.",
                nombreComercial: "La Higuera",
                ruc: "20512345678",
                direccion: "Av. La Mar 1234, Miraflores, Lima",
              }}
              cliente={
                ver.buyerRuc
                  ? { nombre: ver.buyerName || "—", docLabel: "RUC", docNum: ver.buyerRuc }
                  : { nombre: ver.buyerName || "CLIENTES VARIOS", docLabel: "DNI", docNum: "—" }
              }
              lines={[{ name: ver.reference || "Consumo", qty: 1, unitPrice: ver.subtotal, extraPrice: 0 }]}
              subtotal={ver.subtotal}
              igv={ver.igv}
              total={ver.total}
              taxRate={ver.subtotal > 0 ? ver.igv / ver.subtotal : 0.18}
              status={ver.status}
            />
            <div className="flex flex-wrap justify-end gap-2 mt-4 no-print">
              {ver.signedXml && (
                <Button variant="secondary" onClick={() => downloadText(`${ver.folio}.xml`, ver.signedXml!, "application/xml")}>
                  ⬇ XML firmado
                </Button>
              )}
              {ver.cdr && (
                <Button variant="secondary" onClick={() => downloadBase64(`R-${ver.folio}.zip`, ver.cdr!, "application/zip")}>
                  ⬇ CDR
                </Button>
              )}
              <Button variant="secondary" onClick={() => window.print()}>
                🖨 Imprimir
              </Button>
              <Button variant="secondary" onClick={printThermal}>
                🧾 Ticket 80mm
              </Button>
              <Button onClick={() => setVer(null)}>Cerrar</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function downloadText(name: string, content: string, type: string) {
  triggerDownload(new Blob([content], { type }), name);
}
function downloadBase64(name: string, b64: string, type: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  triggerDownload(new Blob([bytes], { type }), name);
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
