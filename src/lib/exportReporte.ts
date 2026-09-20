import type { Order, Comprobante, MenuItem, InventoryItem } from "@/data/model";

export interface ReporteData {
  rangoLabel: string;
  orders: Order[]; // pagados en el rango
  comprobantes: Comprobante[];
  menuItems: MenuItem[];
  inventory: InventoryItem[];
  recipes: Record<string, { inventoryId: string; qtyPerUnit: number }[]>;
  taxRate: number;
  currency: string;
}

const MONEY = '#,##0.00';

function lineNet(o: Order): number {
  return o.lines.reduce((s, l) => s + (l.unitPrice + l.extraPrice) * l.qty, 0);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Genera y descarga un Excel detallado del reporte (exceljs, carga diferida). */
export async function exportReporteExcel(data: ReporteData): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wayra POS";
  wb.created = new Date();

  const tax = data.taxRate;
  const costByInv = new Map(data.inventory.map((i) => [i.id, i.cost ?? 0]));
  const itemById = new Map(data.menuItems.map((m) => [m.id, m]));
  const dishCost = (itemId: string | null): number => {
    if (!itemId) return 0;
    const r = data.recipes[itemId];
    if (!r) return 0;
    return round2(r.reduce((s, x) => s + x.qtyPerUnit * (costByInv.get(x.inventoryId) ?? 0), 0));
  };

  const titleStyle = { font: { bold: true, size: 14 } };

  function headerRow(ws: import("exceljs").Worksheet, row: number) {
    ws.getRow(row).eachCell((c) => {
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0F7" } };
      c.border = { bottom: { style: "thin", color: { argb: "FFCED2DE" } } };
    });
  }

  // ---- Resumen ----
  const resumen = wb.addWorksheet("Resumen");
  resumen.columns = [{ width: 28 }, { width: 18 }, { width: 18 }];
  resumen.mergeCells("A1:C1");
  resumen.getCell("A1").value = "Wayra POS — Reporte de ventas";
  resumen.getCell("A1").style = titleStyle;
  resumen.getCell("A2").value = `Rango: ${data.rangoLabel}`;
  resumen.getCell("A3").value = `Generado: ${new Date().toLocaleString("es-PE")}`;

  const ventas = round2(data.orders.reduce((s, o) => s + lineNet(o), 0));
  const igvTot = round2(ventas * tax);
  const cobrado = round2(data.orders.reduce((s, o) => s + (o.paidTotal ?? 0), 0));
  const tickets = data.orders.length;
  const kpiStart = 5;
  const kpis: [string, number][] = [
    ["Op. gravada (ventas netas)", ventas],
    [`IGV (${Math.round(tax * 100)}%)`, igvTot],
    ["Total gravado", round2(ventas + igvTot)],
    ["Cobrado (incl. propina/desc.)", cobrado],
    ["Tickets", tickets],
    ["Ticket promedio", tickets ? round2(cobrado / tickets) : 0],
  ];
  kpis.forEach(([label, val], i) => {
    const r = kpiStart + i;
    resumen.getCell(`A${r}`).value = label;
    resumen.getCell(`B${r}`).value = val;
    resumen.getCell(`B${r}`).numFmt = MONEY;
  });

  // Por método de pago
  const byMethod: Record<string, number> = {};
  for (const o of data.orders) byMethod[o.paidMethod ?? "—"] = round2((byMethod[o.paidMethod ?? "—"] ?? 0) + (o.paidTotal ?? 0));
  const mStart = kpiStart + kpis.length + 1;
  resumen.getCell(`A${mStart}`).value = "Cobrado por método";
  resumen.getCell(`A${mStart}`).font = { bold: true };
  Object.entries(byMethod).forEach(([m, v], i) => {
    const r = mStart + 1 + i;
    resumen.getCell(`A${r}`).value = m;
    resumen.getCell(`B${r}`).value = v;
    resumen.getCell(`B${r}`).numFmt = MONEY;
  });

  // ---- Ventas por día ----
  const dias = wb.addWorksheet("Ventas por día");
  dias.columns = [
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Tickets", key: "tickets", width: 10 },
    { header: "Op. gravada", key: "sub", width: 14, style: { numFmt: MONEY } },
    { header: "IGV", key: "igv", width: 14, style: { numFmt: MONEY } },
    { header: "Total", key: "total", width: 14, style: { numFmt: MONEY } },
  ];
  const byDay = new Map<string, { tickets: number; sub: number }>();
  for (const o of data.orders) {
    const d = new Date(o.openedAt).toLocaleDateString("es-PE");
    const cur = byDay.get(d) ?? { tickets: 0, sub: 0 };
    cur.tickets += 1;
    cur.sub = round2(cur.sub + lineNet(o));
    byDay.set(d, cur);
  }
  for (const [fecha, v] of [...byDay.entries()].sort()) {
    const igv = round2(v.sub * tax);
    dias.addRow({ fecha, tickets: v.tickets, sub: v.sub, igv, total: round2(v.sub + igv) });
  }
  headerRow(dias, 1);

  // ---- Pedidos ----
  const ped = wb.addWorksheet("Pedidos");
  ped.columns = [
    { header: "Fecha/Hora", key: "f", width: 20 },
    { header: "Mesa", key: "mesa", width: 8 },
    { header: "Método", key: "met", width: 14 },
    { header: "Op. gravada", key: "sub", width: 14, style: { numFmt: MONEY } },
    { header: "IGV", key: "igv", width: 12, style: { numFmt: MONEY } },
    { header: "Total", key: "total", width: 12, style: { numFmt: MONEY } },
    { header: "Cobrado", key: "cob", width: 12, style: { numFmt: MONEY } },
  ];
  for (const o of data.orders) {
    const sub = round2(lineNet(o));
    const igv = round2(sub * tax);
    ped.addRow({
      f: new Date(o.openedAt).toLocaleString("es-PE"),
      mesa: o.tableLabel,
      met: o.paidMethod ?? "—",
      sub, igv, total: round2(sub + igv), cob: o.paidTotal ?? 0,
    });
  }
  headerRow(ped, 1);

  // ---- Detalle por línea ----
  const det = wb.addWorksheet("Detalle");
  det.columns = [
    { header: "Fecha", key: "f", width: 14 },
    { header: "Mesa", key: "mesa", width: 8 },
    { header: "Platillo", key: "item", width: 30 },
    { header: "Cant.", key: "qty", width: 8 },
    { header: "P. Unit.", key: "pu", width: 12, style: { numFmt: MONEY } },
    { header: "Importe", key: "imp", width: 12, style: { numFmt: MONEY } },
  ];
  for (const o of data.orders) {
    for (const l of o.lines) {
      const pu = round2(l.unitPrice + l.extraPrice);
      det.addRow({ f: new Date(o.openedAt).toLocaleDateString("es-PE"), mesa: o.tableLabel, item: l.name, qty: l.qty, pu, imp: round2(pu * l.qty) });
    }
  }
  headerRow(det, 1);

  // ---- Por platillo (food cost) ----
  const plat = wb.addWorksheet("Por platillo (food cost)");
  plat.columns = [
    { header: "Platillo", key: "item", width: 30 },
    { header: "Vendidos", key: "qty", width: 10 },
    { header: "Ingreso", key: "ing", width: 14, style: { numFmt: MONEY } },
    { header: "Costo receta u.", key: "cu", width: 16, style: { numFmt: MONEY } },
    { header: "Costo total", key: "ct", width: 14, style: { numFmt: MONEY } },
    { header: "Margen", key: "mg", width: 14, style: { numFmt: MONEY } },
    { header: "Margen %", key: "mgp", width: 12, style: { numFmt: "0.0%" } },
  ];
  const agg = new Map<string, { qty: number; ing: number }>();
  for (const o of data.orders) {
    for (const l of o.lines) {
      const key = l.itemId ?? l.name;
      const cur = agg.get(key) ?? { qty: 0, ing: 0 };
      cur.qty += l.qty;
      cur.ing = round2(cur.ing + (l.unitPrice + l.extraPrice) * l.qty);
      agg.set(key, cur);
    }
  }
  for (const [key, v] of agg) {
    const item = itemById.get(key);
    const cu = dishCost(item ? item.id : null);
    const ct = round2(cu * v.qty);
    const mg = round2(v.ing - ct);
    plat.addRow({
      item: item?.name ?? key,
      qty: v.qty,
      ing: v.ing,
      cu: cu || "",
      ct: ct || "",
      mg: cu ? mg : "",
      mgp: cu && v.ing ? mg / v.ing : "",
    });
  }
  headerRow(plat, 1);

  // ---- Comprobantes ----
  const cpe = wb.addWorksheet("Comprobantes");
  cpe.columns = [
    { header: "Folio", key: "folio", width: 16 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Referencia", key: "ref", width: 18 },
    { header: "Total", key: "total", width: 12, style: { numFmt: MONEY } },
    { header: "Estado SUNAT", key: "estado", width: 16 },
    { header: "Fecha", key: "fecha", width: 20 },
  ];
  for (const c of data.comprobantes) {
    cpe.addRow({
      folio: c.folio, tipo: c.tipo, ref: c.reference, total: c.total, estado: c.status,
      fecha: new Date(c.issuedAt).toLocaleString("es-PE"),
    });
  }
  headerRow(cpe, 1);

  // Descargar
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Wayra-POS-Reporte-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
