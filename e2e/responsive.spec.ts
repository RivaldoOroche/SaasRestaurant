import { test, expect, type Page } from "@playwright/test";

// Regresión de diseño móvil: ninguna pantalla debe desbordar horizontalmente
// a 360 px (celular Android pequeño). Detecta filas flex sin envolver, campos
// con ancho mínimo intrínseco, acciones de encabezado que no bajan, etc.

const SAAS = ["resumen", "tenants", "retencion", "ingresos", "cobros", "planes", "soporte", "bitacora", "config", "ayuda"];
const POS = [
  "pedido", "mesas", "reservas", "cuentas", "cocina", "delivery", "online", "carta", "editor", "inventario",
  "clientes", "sunat", "reclamaciones", "caja", "reportes", "sucursales", "plan", "permisos", "panel", "ajustes", "ayuda",
];

async function login(page: Page, pin: string) {
  await page.addInitScript(() => {
    localStorage.setItem("wayra-tour-seen", JSON.stringify({ dueno: true, saas: true, admin: true, mesero: true }));
    localStorage.setItem("wayra-install-dismissed", "1");
  });
  await page.goto("/login");
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
}

/** Elementos dentro de <main> cuyo borde derecho sale de la pantalla. */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: Element[] = [];
    // Dentro de una tira con scroll horizontal propio (p. ej. categorías), lo que
    // no cabe es intencional: basta con que la tira misma quepa en pantalla.
    const inScroller = (el: Element) => {
      for (let a = el.parentElement; a && a.tagName !== "MAIN"; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if ((ox === "auto" || ox === "scroll") && a.getBoundingClientRect().right <= vw + 1 && a.clientWidth <= vw) return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll("main *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= vw + 1) continue;
      if (inScroller(el)) continue;
      if (!out.some((o) => o.contains(el))) out.push(el);
    }
    return out.slice(0, 5).map((el) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
  });
}

/** Contenido de un modal abierto que se sale de los bordes del propio modal. */
async function dialogOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const dlg of document.querySelectorAll('[role="dialog"]')) {
      const box = dlg.getBoundingClientRect();
      for (const el of dlg.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > box.right + 1) out.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
      }
    }
    return out.slice(0, 5);
  });
}

for (const [pin, base, routes] of [
  ["0000", "/saas/", SAAS],
  ["1111", "/pos/", POS],
] as const) {
  test(`móvil 360px: sin desborde horizontal en ${base}*`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 360, height: 780 });
    await login(page, pin);
    const problems: string[] = [];
    for (const r of routes) {
      await page.goto(base + r);
      await page.waitForTimeout(400);
      const bad = await overflowing(page);
      if (bad.length) problems.push(`${base}${r}: ${bad.join(" ; ")}`);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

// /pos/pedido sin mesa solo muestra "Elige una mesa": hay que abrir una mesa
// para medir la vista real (carta + ticket), que es la que usa el mesero.
test("móvil 360px: Pedido con mesa abierta, carta y ticket", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await login(page, "3333"); // mesero
  await page.goto("/pos/mesas");
  await page.getByRole("button", { name: /Libre/ }).first().click();
  await expect(page).toHaveURL(/\/pos\/pedido/);

  // Carta: categorías en tira horizontal, sin desborde.
  await expect(page.getByRole("button", { name: /Ver ticket/ })).toBeVisible();
  expect(await overflowing(page)).toEqual([]);

  // Agregar un plato con "+" y abrir el ticket a pantalla completa.
  await page.getByRole("button", { name: /^Agregar / }).first().click();
  await expect(page.getByText(/1 ítems/)).toBeVisible();
  await page.getByRole("button", { name: /Ver ticket/ }).click();
  const ticket = page.getByRole("complementary", { name: "Ticket del pedido" });
  await expect(ticket.getByRole("button", { name: "Enviar a cocina" })).toBeInViewport();
  await expect(ticket.getByRole("button", { name: "Cobrar" })).toBeInViewport();
  expect(await overflowing(page)).toEqual([]);

  // Cobro (modal): métodos de pago y botones dentro del cuadro.
  await ticket.getByRole("button", { name: "Cobrar" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await dialogOverflow(page)).toEqual([]);
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

  // Volver a la carta cierra la hoja.
  await ticket.getByRole("button", { name: "Volver a la carta" }).click();
  await expect(ticket).toBeHidden();

  // Modificadores (modal al tocar un plato).
  await page.getByText("Causa limeña").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await dialogOverflow(page)).toEqual([]);
});
