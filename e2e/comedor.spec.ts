import { test, expect, type Page } from "@playwright/test";

// Comedor escolar (demo: Comedor San Martín). Dueña 5555, atención 6666.
// Recarga en caja → despacho del menú y del kiosko con las reglas del colegio →
// portal de la familia (saldo, reserva, topes) → navegación por tipo de negocio.

async function login(page: Page, pin: string) {
  await page.addInitScript(() => {
    localStorage.setItem("wayra-tour-seen", JSON.stringify({ dueno: true, saas: true, admin: true, mesero: true }));
    localStorage.setItem("wayra-install-dismissed", "1");
    localStorage.setItem("wayra-legal-accepted", JSON.stringify({ terminos: "2026-10.2", privacidad: "2026-10", encargo: "2026-10" }));
  });
  await page.goto("/login");
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
}

test("comedor: recarga, despacho del menú y del kiosko, y portal de la familia", async ({ page }) => {
  await login(page, "5555");
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  // El comedor tiene su propio menú: sin mesas ni cocina.
  await expect(nav.getByRole("link", { name: "Despacho" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Mesas" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hola, Rosa" })).toBeVisible();

  // Caja abierta para recibir efectivo.
  await page.goto("/pos/caja");
  await page.getByLabel("Fondo inicial").fill("100");
  await page.getByRole("button", { name: /Abrir caja con/ }).click();
  await expect(page.getByText("Caja abierta")).toBeVisible();

  // Recarga de S/ 50 en efectivo a Lucía.
  await page.goto("/pos/comensales");
  await page.getByLabel("Buscar comensal").fill("Lucía");
  await page.getByRole("button", { name: "Recargar" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Monto recibido (S/)").fill("50");
  await dlg.getByRole("button", { name: "Efectivo", exact: true }).click();
  await dlg.getByRole("button", { name: /^Recargar/ }).click();
  await expect(dlg.getByRole("status")).toContainText("Recarga registrada");
  await dlg.getByRole("button", { name: "Listo" }).click();

  // Despacho del menú por código (como un lector de tarjetas: escribe y Enter).
  await page.goto("/pos/despacho");
  await page.getByLabel("Buscar comensal").fill("A-0101");
  await page.getByLabel("Buscar comensal").press("Enter");
  await expect(page.getByRole("heading", { name: "Lucía Ramos Torres" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Alergias: Maní" })).toBeVisible();
  await page.getByRole("button", { name: /^Entregar menú/ }).click();
  await expect(page.getByRole("status")).toContainText("Lucía Ramos Torres: menú entregado");

  // Una ración por día: la segunda vez no se puede.
  await page.getByLabel("Buscar comensal").fill("A-0101");
  await page.getByLabel("Buscar comensal").press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "ya recibió su menú hoy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "No se puede entregar" })).toBeDisabled();

  // Kiosko: lo que tiene octógonos no se vende; un sándwich se cobra del saldo.
  await page.getByRole("radio", { name: /Kiosko/ }).click();
  await expect(page.getByRole("button", { name: "Agregar Galleta rellena" })).toBeDisabled();
  await page.getByRole("button", { name: "Agregar Sándwich de pollo" }).click();
  await page.getByRole("button", { name: /Cobrar S\/ 6.00 con saldo/ }).click();
  await expect(page.getByRole("status")).toContainText("S/ 6.00 cobrado");

  // Portal de la familia de Lucía (enlace privado).
  const token = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("nubepos-mock-comedor-v1") ?? "{}");
    return st.responsables.find((r: { name: string }) => r.name === "Rosa Torres").portalToken as string;
  });
  await page.goto(`/familia/${token}`);
  await expect(page.getByRole("heading", { name: "Hola, Rosa" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lucía Ramos Torres" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mateo Ramos Torres" })).toBeVisible();
  const lucia = page.locator("section").filter({ has: page.getByRole("heading", { name: "Lucía Ramos Torres" }) });
  await lucia.getByRole("tab", { name: "Consumos" }).click();
  await expect(lucia.getByText("1× Sándwich de pollo")).toBeVisible();
  await lucia.getByRole("tab", { name: "Topes y alergias" }).click();
  await lucia.getByLabel("Tope diario en el kiosko (S/)").fill("7");
  await lucia.getByRole("button", { name: "Guardar" }).click();
  await expect(lucia.getByRole("status")).toContainText("Guardado");
});

test("comedor: la atención no ve reportes ni el menú; el restaurante no ve el despacho", async ({ page }) => {
  await login(page, "6666");
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(page).toHaveURL(/\/pos\/despacho/);
  await expect(nav.getByRole("link", { name: "Comensales" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Menú del día" })).toHaveCount(0);
  await page.goto("/pos/comedor-reportes");
  await expect(page).toHaveURL(/\/pos\/despacho/);
});

test("restaurante: no muestra las pantallas del comedor", async ({ page }) => {
  await login(page, "1111");
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link", { name: "Mesas" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Despacho" })).toHaveCount(0);
  await page.goto("/pos/despacho");
  await expect(page).not.toHaveURL(/\/pos\/despacho/);
});
