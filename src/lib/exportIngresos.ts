import type { SaasInvoice, PlanInfo } from "@/data/platform/model";

const MONEY = "#,##0.00";

/** Genera y descarga un Excel de la cobranza SaaS (exceljs, carga diferida). */
export async function exportIngresosExcel(invoices: SaasInvoice[], plans: PlanInfo[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wayra POS";
  wb.created = new Date();

  // Hoja 1 — Facturas
  const s1 = wb.addWorksheet("Facturas");
  s1.mergeCells("A1:D1");
  s1.getCell("A1").value = "Cobranza de suscripciones";
  s1.getCell("A1").font = { bold: true, size: 14 };
  s1.addRow([]);
  const head = s1.addRow(["Tenant", "Fecha", "Estado", "Monto (S/)"]);
  head.font = { bold: true };
  head.eachCell((c) => (c.border = { bottom: { style: "thin" } }));
  for (const inv of invoices) {
    const r = s1.addRow([inv.tenant, inv.date, inv.status, inv.amount]);
    r.getCell(4).numFmt = MONEY;
  }
  const total = invoices.reduce((sum, i) => sum + i.amount, 0);
  const paid = invoices.filter((i) => i.status === "Pagada").reduce((sum, i) => sum + i.amount, 0);
  s1.addRow([]);
  const tRow = s1.addRow(["Total facturado", "", "", total]);
  tRow.font = { bold: true };
  tRow.getCell(4).numFmt = MONEY;
  const pRow = s1.addRow(["Cobrado (Pagada)", "", "", paid]);
  pRow.getCell(4).numFmt = MONEY;
  const dRow = s1.addRow(["Pendiente", "", "", Math.round((total - paid) * 100) / 100]);
  dRow.getCell(4).numFmt = MONEY;
  s1.columns.forEach((c, i) => (c.width = i === 0 ? 28 : 16));

  // Hoja 2 — MRR por plan
  const s2 = wb.addWorksheet("MRR por plan");
  const h2 = s2.addRow(["Plan", "Precio", "Suscriptores", "MRR (S/)"]);
  h2.font = { bold: true };
  for (const p of plans) {
    const r = s2.addRow([p.tier, p.price, p.subscribers, p.mrr]);
    r.getCell(2).numFmt = MONEY;
    r.getCell(4).numFmt = MONEY;
  }
  const mrr = plans.reduce((sum, p) => sum + p.mrr, 0);
  const totRow = s2.addRow(["Total MRR", "", "", mrr]);
  totRow.font = { bold: true };
  totRow.getCell(4).numFmt = MONEY;
  s2.addRow(["ARR (x12)", "", "", Math.round(mrr * 12 * 100) / 100]).getCell(4).numFmt = MONEY;
  s2.columns.forEach((c, i) => (c.width = i === 0 ? 16 : 16));

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ingresos-wayra-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
