// Genera el PDF de configuración de un tenant: datos del emisor, proveedor de
// facturación elegido y los pasos requeridos para dejarlo operativo. jsPDF se
// importa dinámicamente para no cargarlo en el bundle principal.

import type { BusinessSettings } from "@/data/model";

const ACCENT: [number, number, number] = [0x91, 0x84, 0xd9];
const INK: [number, number, number] = [0x1a, 0x1c, 0x2b];
const MUTED: [number, number, number] = [0x6b, 0x70, 0x80];

const PROVIDER_LABEL: Record<string, string> = {
  ninguno: "Sin definir",
  sunat_directo: "SUNAT directo (emisor propio)",
  nubefact: "Nubefact (OSE/PSE)",
  bizlinks: "Bizlinks (OSE/PSE)",
  efact: "Efact (OSE/PSE)",
};

/** Pasos por proveedor de facturación. */
function pasosFacturacion(s: BusinessSettings): string[] {
  const provider = s.billingProvider ?? "ninguno";
  if (provider === "sunat_directo") {
    return [
      "Obtener el certificado digital tributario del contribuyente (producción) o generar uno autofirmado (homologación beta).",
      "Registrar/recordar el usuario y clave SOL secundarios con permiso de facturación electrónica en SUNAT Operaciones en Línea.",
      "Cargar en Ajustes → Facturación: usuario SOL, clave SOL, certificado (PEM) y llave privada (PKCS#8).",
      "Homologar en el ambiente beta de SUNAT (RUC 20000000001, usuario MODDATOS, clave MODDATOS) emitiendo boleta, factura y nota de crédito de prueba.",
      "Una vez aprobada la homologación, cambiar el modo a 'Producción' y usar el certificado y credenciales reales.",
    ];
  }
  if (provider === "ninguno") {
    return [
      "Elegir un proveedor de facturación en Ajustes → Facturación (SUNAT directo o un OSE/PSE).",
      "Reunir las credenciales que exige el proveedor elegido.",
      "Completar los datos del emisor (RUC, razón social, dirección y ubigeo).",
    ];
  }
  // OSE / PSE
  return [
    `Contratar el servicio de ${PROVIDER_LABEL[provider]} y solicitar acceso al ambiente de homologación.`,
    "Obtener el endpoint (URL) y el token/API key que entrega el proveedor.",
    "Cargar en Ajustes → Facturación: endpoint y token del proveedor.",
    "Emitir comprobantes de prueba (boleta, factura y nota de crédito) hasta pasar la homologación del proveedor y de SUNAT.",
    "Cambiar a producción y reemplazar el token/endpoint por los definitivos.",
  ];
}

/** Pasos de pagos según lo configurado. */
function pasosPagos(s: BusinessSettings): string[] {
  const steps: string[] = [];
  if (s.yapeNumber || s.plinNumber) {
    steps.push("Verificar que los números de Yape/Plin mostrados en el cobro correspondan a la cuenta del negocio.");
  } else {
    steps.push("Configurar los números de Yape y Plin en Ajustes → Pagos para mostrar el QR al cobrar.");
  }
  const card = s.cardProvider ?? "ninguno";
  if (card === "ninguno") {
    steps.push("Opcional: elegir un proveedor de tarjeta (Culqi, Izipay o Niubiz) si se aceptarán pagos con tarjeta.");
  } else {
    steps.push(`Cargar la llave pública y la llave secreta de ${card} en Ajustes → Pagos (la secreta se guarda cifrada).`);
  }
  return steps;
}

export async function generateConfigPdf(s: BusinessSettings): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48; // margen
  const CW = W - M * 2;
  let y = M;

  function ensure(space: number) {
    if (y + space > H - M) {
      doc.addPage();
      y = M;
    }
  }
  function heading(text: string) {
    ensure(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...ACCENT);
    doc.text(text, M, y);
    y += 8;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1);
    doc.line(M, y, M + CW, y);
    y += 16;
  }
  function kv(label: string, value: string) {
    ensure(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`${label}:`, M, y);
    const lw = doc.getTextWidth(`${label}: `);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(value || "—", CW - lw);
    doc.text(lines, M + lw, y);
    y += 14 * lines.length;
  }
  function bullets(items: string[]) {
    doc.setFontSize(10);
    items.forEach((it, i) => {
      const lines = doc.splitTextToSize(it, CW - 22);
      ensure(14 * lines.length + 6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ACCENT);
      doc.text(`${i + 1}.`, M, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK);
      doc.text(lines, M + 20, y);
      y += 14 * lines.length + 6;
    });
    y += 4;
  }
  function paragraph(text: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(text, CW);
    ensure(13 * lines.length);
    doc.text(lines, M, y);
    y += 13 * lines.length + 8;
  }

  // --- Portada / encabezado ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...ACCENT);
  doc.text("Wayra POS", M, y);
  y += 24;
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text("Guía de configuración del negocio", M, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(
    `${s.name || "Negocio"} · Generado el ${new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}`,
    M,
    y,
  );
  y += 26;

  // --- Datos del emisor ---
  heading("1. Datos del emisor");
  kv("RUC", s.ruc ?? "");
  kv("Razón social", s.razonSocial ?? "");
  kv("Dirección fiscal", s.direccionFiscal ?? "");
  kv("Ubigeo", s.ubigeo ?? "");
  kv("Moneda", s.currency);
  kv("IGV", `${s.taxRate}%`);
  y += 6;

  // --- Facturación electrónica ---
  heading("2. Facturación electrónica");
  kv("Proveedor", PROVIDER_LABEL[s.billingProvider ?? "ninguno"]);
  kv("Modo SUNAT", s.sunatMode === "produccion" ? "Producción" : "Homologación (beta)");
  if ((s.billingProvider ?? "ninguno") === "sunat_directo") {
    kv("Usuario SOL", s.solUser ?? "");
    kv("Clave SOL", "•••••••• (guardada de forma segura)");
    kv("Certificado / llave", "Cargados de forma segura en el servidor");
  } else if ((s.billingProvider ?? "ninguno") !== "ninguno") {
    kv("Endpoint", s.billingEndpoint ?? "");
    kv("Token / API key", "•••••••• (guardado de forma segura)");
  }
  y += 4;
  paragraph(
    "Nota de seguridad: las credenciales secretas (clave SOL, certificado, llave privada, token) se guardan cifradas del lado del servidor y nunca se devuelven al navegador.",
  );

  heading("3. Pasos para activar la facturación");
  bullets(pasosFacturacion(s));

  // --- Pagos ---
  heading("4. Pagos");
  kv("Yape", s.yapeNumber ?? "");
  kv("Plin", s.plinNumber ?? "");
  kv("Proveedor de tarjeta", (s.cardProvider ?? "ninguno") === "ninguno" ? "Ninguno" : (s.cardProvider ?? ""));
  y += 6;
  bullets(pasosPagos(s));

  // --- Checklist ---
  heading("5. Lista de verificación final");
  bullets([
    "Datos del emisor completos y correctos (RUC, razón social, dirección, ubigeo).",
    "Proveedor de facturación elegido y credenciales cargadas.",
    "Homologación beta aprobada antes de emitir en producción.",
    "Números de Yape/Plin verificados y, si aplica, credenciales de tarjeta cargadas.",
    "Carta digital pública revisada y menú actualizado.",
  ]);

  // --- Pie de página con numeración ---
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Wayra POS — Guía de configuración", M, H - 24);
    doc.text(`Página ${p} de ${pages}`, W - M, H - 24, { align: "right" });
  }

  const safe = (s.name || "negocio").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  doc.save(`configuracion-${safe || "tenant"}.pdf`);
}
