// Capturas de la app en modo demo para la presentación comercial.
// Simula un servicio corto (caja abierta, mesas atendidas, comandas en cocina
// y cobros) para que las pantallas muestren datos reales del demo.
// Uso: VITE_USE_MOCK=true npm run dev -- --port 5173
//      node docs/comercial/capturas.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const OUT = new URL("./img/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PW_EXECUTABLE_PATH || undefined,
});

async function login(page, pin) {
  await page.goto(`${BASE}/login`);
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("navigation", { name: "Navegación principal" }).waitFor();
}

async function newContext(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: "es-PE", timezoneId: "America/Lima" });
  await ctx.addInitScript(() => {
    localStorage.setItem("wayra-tour-seen", JSON.stringify({ dueno: true, gerente: true, mesero: true, saas: true, admin: true }));
    localStorage.setItem("wayra-install-dismissed", "1");
    localStorage.setItem("wayra-legal-accepted", JSON.stringify({ terminos: "2026-10", privacidad: "2026-09", encargo: "2026-09" }));
    localStorage.setItem("nubepos-theme", "dark");
  });
  return ctx;
}

async function shot(page, file, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 900);
  await page.screenshot({ path: `${OUT}${file}.png`, fullPage: !!opts.full });
  console.log("✓", file);
}

async function go(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
}

const ticket = (page) => page.getByRole("complementary", { name: "Ticket del pedido" });

/** Abre la primera mesa libre y agrega platos por categoría. */
async function atenderMesa(page, mesa, platos) {
  await go(page, "/pos/mesas");
  await page.getByRole("button", { name: new RegExp(`^Mesa ${mesa} ·.*Libre`) }).first().click();
  await ticket(page).waitFor();
  for (const [cat, n] of platos) {
    if (cat) await page.getByRole("button", { name: new RegExp(`^.*${cat}`) }).first().click().catch(() => {});
    await page.waitForTimeout(200);
    const add = page.getByRole("button", { name: /^Agregar / });
    for (let i = 0; i < n && i < (await add.count()); i++) {
      await add.nth(i).click();
      await page.waitForTimeout(120);
    }
  }
}

async function enviarACocina(page) {
  const b = ticket(page).getByRole("button", { name: /Enviar a cocina/ });
  if (await b.isEnabled().catch(() => false)) await b.click();
  await page.waitForTimeout(400);
}

async function cobrar(page, metodo, captura) {
  await ticket(page).getByRole("button", { name: "Cobrar" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  if (captura) {
    await shot(page, captura, { wait: 600 });
    await dlg.screenshot({ path: `${OUT}${captura}-modal.png` });
  }
  await dlg.locator("button", { hasText: new RegExp(`^${metodo}$`) }).click({ timeout: 5000, force: true }).catch(async (e) => {
    await page.screenshot({ path: `${OUT}../error.png` });
    console.log((await dlg.innerText()).slice(0, 600).replace(/\n/g, " | "));
    throw e;
  });
  await dlg.getByRole("button", { name: "Registrar pago" }).click();
  if (metodo === "Yape") {
    await shot(page, "cobro-yape", { wait: 600 });
    await dlg.screenshot({ path: `${OUT}yape-modal.png` });
  }
  await dlg.getByRole("button", { name: /^Confirmar/ }).click();
  await page.waitForTimeout(700);
  if (captura) {
    await shot(page, `${captura}-emitido`, { wait: 600 });
    await dlg.screenshot({ path: `${OUT}boleta-modal.png` });
  }
  await dlg.locator("button", { hasText: /^Emitir/ }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

// ── Escritorio / tablet horizontal: el dueño simula el servicio ──
{
  const ctx = await newContext(1366, 1000);
  const page = await ctx.newPage();
  await login(page, "1111");

  await go(page, "/pos/caja");
  await page.getByLabel("Fondo inicial").fill("300");
  await page.getByRole("button", { name: /Abrir caja con/ }).click();
  await page.waitForTimeout(400);

  // Mesas cobradas (alimentan reportes, caja e inventario).
  const servicio = [
    [["Ceviches", 2], ["Barra", 2]],
    [["Entradas", 1], ["Segundos", 2]],
    [["Segundos", 3], ["Postres", 1]],
    [["Ceviches", 1], ["Segundos", 1], ["Barra", 1]],
  ];
  const metodos = ["Efectivo", "Yape", "Tarjeta", "Plin"];
  const mesasCobradas = [7, 8, 11, 12];
  for (let i = 0; i < servicio.length; i++) {
    await atenderMesa(page, mesasCobradas[i], servicio[i]);
    await enviarACocina(page);
    await cobrar(page, metodos[i], i === 1 ? "cobro" : null);
  }

  // Mesas en curso (comandas vivas en cocina).
  await atenderMesa(page, 2, [["Ceviches", 2], ["Entradas", 1]]);
  await enviarACocina(page);
  await atenderMesa(page, 5, [["Segundos", 2], ["Barra", 2]]);
  await enviarACocina(page);
  await atenderMesa(page, 1, [["Entradas", 2], ["Segundos", 1]]);
  await shot(page, "pedido");
  await enviarACocina(page);

  await go(page, "/pos/cocina");
  await page.waitForTimeout(600);
  const comanda = page.locator("main [role=button], main button").filter({ hasText: /Mesa|M\d/ }).first();
  if (await comanda.count()) await comanda.click().catch(() => {});
  await shot(page, "cocina");

  // Reposición de culantro: compra registrada antes de las capturas de gestión.
  await go(page, "/pos/inventario");
  await page.getByRole("button", { name: "Registrar compra de Culantro" }).click().catch(() => {});
  const mov = page.getByRole("dialog");
  if (await mov.count()) {
    await mov.locator("input[inputmode=decimal], input[type=number]").first().fill("12");
    await mov.locator("button", { hasText: "Registrar compra" }).click({ force: true });
    await page.waitForTimeout(500);
  }

  for (const [path, file] of [
    ["/pos/panel", "panel"],
    ["/pos/mesas", "mesas"],
    ["/pos/caja", "caja"],
    ["/pos/reportes", "reportes"],
    ["/pos/inventario", "inventario"],
    ["/pos/sunat", "sunat"],
    ["/pos/delivery", "delivery"],
    ["/pos/editor", "carta-editor"],
    ["/pos/clientes", "clientes"],
  ]) {
    await go(page, path);
    await shot(page, file);
  }
  await go(page, "/pos/sunat");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}sunat-lista.png`, clip: { x: 100, y: 64, width: 860, height: 492 } });
  console.log("✓ sunat-lista");
  await ctx.close();
}

// ── Celular del mesero ──
{
  const ctx = await newContext(390, 844);
  const page = await ctx.newPage();
  await login(page, "3333");
  await go(page, "/pos/mesas");
  await shot(page, "movil-mesas");
  await ctx.close();
}

// ── Carta QR pública ──
{
  const ctx = await newContext(390, 844);
  const page = await ctx.newPage();
  await go(page, "/carta/la-higuera");
  await shot(page, "movil-carta", { wait: 1500 });
  await ctx.close();
}

await browser.close();
