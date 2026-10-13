// Reportes del comedor: menús entregados, ventas, recargas por medio de pago,
// aprovechamiento de raciones (desperdicio), consumo por grado/área y la
// liquidación de convenios para facturar al colegio o a la empresa.
import { useMemo, useState } from "react";
import { useComedorMenus, useComensales, useConsumos, useMovimientos, useReservas, useSettings } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { localDate } from "@/lib/comedor";
import { comedorReport, type ComedorReport } from "@/lib/comedorReport";
import { cn } from "@/lib/cn";

type Rango = "hoy" | "semana" | "mes";
const PAGO_LABEL: Record<string, string> = {
  saldo: "Saldo",
  abono: "Abono",
  convenio: "Convenio",
  efectivo: "Efectivo (al paso)",
  yape: "Yape (al paso)",
  plin: "Plin (al paso)",
  tarjeta: "Tarjeta (al paso)",
};

function rango(r: Rango): { from: string; to: string; label: string } {
  const now = new Date();
  const to = localDate(now);
  if (r === "hoy") return { from: to, to, label: "Hoy" };
  if (r === "semana") {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunes
    return { from: localDate(d), to, label: "Esta semana" };
  }
  return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to, label: "Este mes" };
}

export function ComedorReportes() {
  const [r, setR] = useState<Rango>("mes");
  const { from, to, label } = rango(r);
  const today = localDate();
  const { data: settings } = useSettings();
  const { data: consumos = [] } = useConsumos(from, to);
  const { data: movimientos = [] } = useMovimientos(null, from);
  const { data: menus = [] } = useComedorMenus(from, to);
  const { data: reservas = [] } = useReservas(from, to);
  const { data: comensales = [] } = useComensales();
  const rep = useMemo(
    () => comedorReport({ consumos, movimientos, menus, reservas, comensales }, from, to, today),
    [consumos, movimientos, menus, reservas, comensales, from, to, today],
  );

  return (
    <div className="p-6 mob:p-4 max-w-6xl">
      <ScreenHeader
        title="Reportes del comedor"
        subtitle={`${label} · ${settings?.name ?? ""}`}
        actions={
          <>
            <div className="flex gap-1 rounded-lg bg-chip-bg p-1" role="radiogroup" aria-label="Rango">
              {(["hoy", "semana", "mes"] as const).map((k) => (
                <button key={k} role="radio" aria-checked={r === k} onClick={() => setR(k)} className={cn("rounded-md px-3 py-1.5 text-sm capitalize", r === k ? "bg-accent text-white" : "text-muted")}>
                  {k === "hoy" ? "Hoy" : k === "semana" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => void exportExcel(rep, label, settings?.name ?? "Comedor")}>
              ⬇ Exportar Excel
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Menús entregados" value={String(rep.menus)} sub={rep.raciones ? `de ${rep.raciones} raciones preparadas` : undefined} />
        <Kpi label="Ventas cobradas" value={formatMoney(rep.ventas)} sub={`menú ${formatMoney(rep.ventasMenu)} · kiosko ${formatMoney(rep.ventasKiosko)}`} />
        <Kpi label="Dinero recibido" value={formatMoney(rep.recargado + rep.abonos)} sub={`recargas ${formatMoney(rep.recargado)} · abonos ${formatMoney(rep.abonos)}`} />
        <Kpi
          label="Aprovechamiento"
          value={rep.aprovechamiento == null ? "—" : `${rep.aprovechamiento} %`}
          sub={`${rep.sobrantes} raciones sobrantes · ${rep.reservasNoRecogidas} reservas no recogidas`}
          warn={rep.aprovechamiento != null && rep.aprovechamiento < 85}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Consumos por forma de pago</h3>
            <Table
              head={["Forma de pago", "Despachos", "Cobrado"]}
              rows={rep.porPago.map((p) => [PAGO_LABEL[p.pago] ?? p.pago, String(p.count), p.pago === "abono" || p.pago === "convenio" ? "—" : formatMoney(p.total)])}
              empty="Sin consumos en el rango."
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Recargas y abonos recibidos</h3>
            <Table head={["Medio", "Operaciones", "Monto"]} rows={rep.recargas.map((x) => [x.method, String(x.count), formatMoney(x.total)])} empty="Sin recargas en el rango." />
            <p className="text-xs text-muted mt-2">
              Saldo adelantado en monederos hoy: <b className="font-mono">{formatMoney(rep.saldoMonederos)}</b> (dinero de las familias pendiente de consumir).
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Por grado o área</h3>
            <Table head={["Grupo", "Menús", "Kiosko"]} rows={rep.porGrupo.map((g) => [g.grupo, String(g.menus), formatMoney(g.kiosko)])} empty="Sin consumos." />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Lo más vendido en el kiosko</h3>
            <Table head={["Producto", "Unidades", "Total"]} rows={rep.topKiosko.map((p) => [p.name, String(p.qty), formatMoney(p.total)])} empty="Sin ventas de kiosko." />
          </CardBody>
        </Card>
        <Card className="md:col-span-2">
          <CardBody>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h3 className="font-semibold">Liquidación de convenios</h3>
              <span className="text-sm">
                Total a facturar: <b className="font-mono">{formatMoney(rep.totalConvenios)}</b>
              </span>
            </div>
            <p className="text-xs text-muted mb-2">Menús entregados a comensales con convenio, al precio publicado de cada día. Es lo que se factura al colegio o a la empresa.</p>
            <Table
              head={["Comensal", "Grupo", "Menús", "Importe"]}
              rows={rep.convenios.map((c) => [c.name, c.grupo, String(c.menus), formatMoney(c.total)])}
              empty="Sin menús por convenio en el rango."
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Card>
      <CardBody>
        <p className="text-muted text-xs uppercase tracking-wide">{label}</p>
        <p className={cn("text-2xl font-bold font-mono mt-1", warn && "text-warning")}>{value}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </CardBody>
    </Card>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={h} className={cn("py-1.5 font-semibold", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cn("py-1.5", j > 0 && "text-right font-mono")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function exportExcel(rep: ComedorReport, label: string, name: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wayra POS";
  const add = (title: string, head: string[], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(title);
    ws.addRow(head).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => (c.width = 22));
  };
  add("Resumen", ["Indicador", "Valor"], [
    ["Comedor", name],
    ["Rango", label],
    ["Menús entregados", rep.menus],
    ["Raciones preparadas", rep.raciones],
    ["Raciones sobrantes", rep.sobrantes],
    ["Aprovechamiento %", rep.aprovechamiento ?? ""],
    ["Reservas no recogidas", rep.reservasNoRecogidas],
    ["Ventas cobradas (S/)", rep.ventas],
    ["Recargas (S/)", rep.recargado],
    ["Abonos (S/)", rep.abonos],
    ["Saldo en monederos (S/)", rep.saldoMonederos],
    ["Convenios a facturar (S/)", rep.totalConvenios],
  ]);
  add("Formas de pago", ["Forma de pago", "Despachos", "Cobrado (S/)"], rep.porPago.map((p) => [PAGO_LABEL[p.pago] ?? p.pago, p.count, p.total]));
  add("Recargas", ["Medio", "Operaciones", "Monto (S/)"], rep.recargas.map((x) => [x.method, x.count, x.total]));
  add("Por grupo", ["Grupo", "Menús", "Kiosko (S/)"], rep.porGrupo.map((g) => [g.grupo, g.menus, g.kiosko]));
  add("Kiosko", ["Producto", "Unidades", "Total (S/)"], rep.topKiosko.map((p) => [p.name, p.qty, p.total]));
  add("Convenios", ["Comensal", "Grupo", "Menús", "Importe (S/)"], rep.convenios.map((c) => [c.name, c.grupo, c.menus, c.total]));
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Wayra-Comedor-${label.replace(/\s+/g, "-")}-${localDate()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
