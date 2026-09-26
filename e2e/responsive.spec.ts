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
    localStorage.setItem("wayra-tour-seen", JSON.stringify({ dueno: true, saas: true }));
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
    for (const el of document.querySelectorAll("main *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= vw + 1) continue;
      if (!out.some((o) => o.contains(el))) out.push(el);
    }
    return out.slice(0, 5).map((el) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
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
