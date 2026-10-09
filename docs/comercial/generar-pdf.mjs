// Genera los PDF comerciales a partir de los HTML de esta carpeta.
// Uso: node docs/comercial/generar-pdf.mjs
// (Antes, si cambió la app: node docs/comercial/capturas.mjs con el demo corriendo.)
import { chromium } from "playwright";
import QRCode from "qrcode";

const DIR = new URL("./", import.meta.url);
const OUT = new URL("./pdf/", import.meta.url);
const SITE = "https://wayrapos.pe";

const docs = [
  { html: "propuesta.html", pdf: "Wayra-POS-Propuesta.pdf", title: "Propuesta para tu restaurante" },
  { html: "requisitos.html", pdf: "Wayra-POS-Requisitos-Facturacion-y-Pagos.pdf", title: "Requisitos de facturación electrónica y pagos" },
  { html: "presentacion.html", pdf: "Wayra-POS-Presentacion.pdf", slides: true },
];

const { mkdirSync } = await import("node:fs");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE_PATH || undefined });
const qr = await QRCode.toString(SITE, { type: "svg", margin: 0, color: { dark: "#161826", light: "#ffffff" } });

for (const d of docs) {
  const page = await browser.newPage();
  await page.goto(new URL(d.html, DIR).href, { waitUntil: "networkidle" });
  await page.evaluate(async (svg) => {
    const el = document.getElementById("qr");
    if (el) el.innerHTML = svg;
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
  }, qr);
  const footer = d.slides
    ? undefined
    : `<div style="width:100%;font-family:Inter,sans-serif;font-size:7.5pt;color:#9a9ab0;padding:0 16mm;display:flex;justify-content:space-between">
         <span>Wayra POS · ${d.title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  await page.pdf({
    path: new URL(d.pdf, OUT).pathname,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: !d.slides,
    headerTemplate: "<span></span>",
    footerTemplate: footer,
  });
  console.log("✓", d.pdf);
  await page.close();
}
await browser.close();
