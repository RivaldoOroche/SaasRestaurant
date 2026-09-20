import { numeroALetras } from "@/lib/numeroALetras";
import { formatMoney, type Currency } from "@/lib/money";
import { Qr } from "@/components/Qr";
import type { ComprobanteTipo, OrderLine, SunatStatus } from "@/data/model";

export interface ComprobanteDocProps {
  tipo: ComprobanteTipo;
  folio: string; // serie-correlativo, p.ej. B001-000123
  issuedAt?: Date;
  emisor: { razonSocial: string; nombreComercial?: string; ruc: string; direccion: string };
  cliente: { nombre: string; docLabel: string; docNum: string };
  lines: Pick<OrderLine, "name" | "qty" | "unitPrice" | "extraPrice">[];
  discount?: number;
  refFolio?: string | null; // documento que modifica (notas de crédito)
  motivo?: string | null; // motivo de la nota de crédito
  subtotal: number; // Op. gravada (neto, post-descuento)
  igv: number;
  total: number; // neto + IGV (sin propina)
  taxRate: number; // fracción, p.ej. 0.18
  currency?: Currency;
  method?: string;
}

// Hash visual (no criptográfico) para la maqueta; en real viene del CDR/firma.
function fakeHash(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `${hex}${hex.split("").reverse().join("")}`.slice(0, 28);
}

const STATUS_LABEL: Partial<Record<SunatStatus, string>> = {
  aceptada: "ACEPTADA POR SUNAT",
  encola: "EN COLA (SIN CONEXIÓN)",
  enviando: "ENVIANDO A SUNAT…",
  rechazada: "RECHAZADA POR SUNAT",
};

export function ComprobanteDoc({
  tipo,
  folio,
  issuedAt = new Date(),
  emisor,
  cliente,
  lines,
  discount = 0,
  refFolio,
  motivo,
  subtotal,
  igv,
  total,
  taxRate,
  currency = "PEN",
  status,
}: ComprobanteDocProps & { status?: SunatStatus }) {
  const esNC = tipo === "NotaCredito";
  const titulo = esNC
    ? "NOTA DE CRÉDITO ELECTRÓNICA"
    : tipo === "Factura"
      ? "FACTURA ELECTRÓNICA"
      : "BOLETA DE VENTA ELECTRÓNICA";
  const tipoNombre = esNC ? "Nota de Crédito" : tipo;
  const fecha = issuedAt.toLocaleDateString("es-PE");
  const hora = issuedAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const iso = issuedAt.toISOString().slice(0, 10);

  // Cadena QR SUNAT: RUC|Tipo|Serie|Correlativo|IGV|Total|Fecha|TipoDocCli|NroDocCli|Hash|
  const [serie, correlativo] = folio.split("-");
  const tipoCod = esNC ? "07" : tipo === "Factura" ? "01" : "03";
  const tipoDocCli = cliente.docLabel === "RUC" ? "6" : cliente.docLabel === "DNI" ? "1" : "0";
  const hash = fakeHash(folio + total);
  const qrValue = [
    emisor.ruc, tipoCod, serie ?? "", correlativo ?? "",
    igv.toFixed(2), total.toFixed(2), iso, tipoDocCli, cliente.docNum, hash,
  ].join("|") + "|";

  return (
    <div className="print-area bg-white text-[#1a1c2b] rounded-lg border border-[#e6e8f0] p-5 text-[12px] leading-relaxed">
      {/* Encabezado */}
      <div className="flex justify-between gap-4 border-b border-dashed border-[#c9ccd8] pb-3">
        <div className="min-w-0">
          <p className="font-extrabold text-[15px] leading-tight">{emisor.nombreComercial ?? emisor.razonSocial}</p>
          {emisor.nombreComercial && <p className="text-[11px] text-[#555]">{emisor.razonSocial}</p>}
          <p className="text-[11px] text-[#555] mt-1">{emisor.direccion}</p>
        </div>
        <div className="shrink-0 text-center border border-[#1a1c2b] rounded-md px-3 py-2 w-[190px]">
          <p className="font-mono font-bold text-[12px]">R.U.C. {emisor.ruc}</p>
          <p className="font-bold text-[12px] my-1">{titulo}</p>
          <p className="font-mono font-bold text-[13px]">{folio}</p>
        </div>
      </div>

      {/* Cliente + fecha */}
      <div className="grid grid-cols-2 gap-2 py-3 text-[11.5px] border-b border-dashed border-[#c9ccd8]">
        <div>
          <p><span className="text-[#666]">Cliente:</span> {cliente.nombre}</p>
          <p><span className="text-[#666]">{cliente.docLabel}:</span> {cliente.docNum}</p>
        </div>
        <div className="text-right">
          <p><span className="text-[#666]">Fecha emisión:</span> {fecha}</p>
          <p><span className="text-[#666]">Hora:</span> {hora}</p>
          <p><span className="text-[#666]">Moneda:</span> {currency === "PEN" ? "SOLES (PEN)" : currency}</p>
        </div>
      </div>

      {/* Documento que modifica (notas de crédito) */}
      {esNC && (
        <div className="py-2 text-[11.5px] border-b border-dashed border-[#c9ccd8]">
          <p><span className="text-[#666]">Documento que modifica:</span> {refFolio || "—"}</p>
          <p><span className="text-[#666]">Motivo:</span> {motivo || "Anulación de la operación"}</p>
        </div>
      )}

      {/* Ítems */}
      <table className="w-full mt-2 text-[11.5px]">
        <thead>
          <tr className="text-[#666] border-b border-[#e0e2ea]">
            <th className="text-left py-1 font-semibold w-10">Cant.</th>
            <th className="text-left py-1 font-semibold">Descripción</th>
            <th className="text-right py-1 font-semibold w-20">P. Unit.</th>
            <th className="text-right py-1 font-semibold w-24">Importe</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {lines.map((l, i) => {
            const pu = l.unitPrice + l.extraPrice;
            return (
              <tr key={i} className="border-b border-[#f0f1f5]">
                <td className="py-1">{l.qty}</td>
                <td className="py-1 font-sans">{l.name}</td>
                <td className="py-1 text-right">{formatMoney(pu, currency)}</td>
                <td className="py-1 text-right">{formatMoney(pu * l.qty, currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totales */}
      <div className="flex justify-end mt-3">
        <div className="w-64 space-y-1 font-mono text-[12px]">
          {discount > 0 && (
            <Row label="Descuento" value={"− " + formatMoney(discount, currency)} />
          )}
          <Row label="Op. Gravada" value={formatMoney(subtotal, currency)} />
          <Row label={`I.G.V. (${Math.round(taxRate * 100)}%)`} value={formatMoney(igv, currency)} />
          <div className="flex justify-between border-t border-[#1a1c2b] pt-1 font-bold text-[13px]">
            <span>IMPORTE TOTAL</span>
            <span>{formatMoney(total, currency)}</span>
          </div>
        </div>
      </div>

      {/* Importe en letras */}
      <p className="mt-3 text-[11.5px] border-t border-dashed border-[#c9ccd8] pt-2">
        <span className="text-[#666]">SON:</span>{" "}
        <span className="font-semibold">{numeroALetras(total)} {currency === "PEN" ? "SOLES" : currency}</span>
      </p>

      {/* Pie: QR + leyenda + hash + estado */}
      <div className="flex items-start gap-3 mt-3 pt-3 border-t border-dashed border-[#c9ccd8]">
        <div className="shrink-0 border border-[#e0e2ea] p-[2px] bg-white">
          <Qr value={qrValue} size={64} />
        </div>
        <div className="flex-1 text-[10px] text-[#555] leading-snug">
          <p>Representación impresa de la {tipoNombre} Electrónica.</p>
          <p>Autorizado mediante la normativa de comprobantes de pago electrónicos SUNAT.</p>
          <p className="font-mono mt-1 break-all">Resumen: {hash}</p>
          {status && (
            <p className="mt-1 font-semibold" style={{ color: status === "rechazada" ? "#b8863a" : "#3f7d5c" }}>
              {STATUS_LABEL[status]}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#666]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

