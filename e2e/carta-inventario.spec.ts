import { test, expect, type Page } from "@playwright/test";

// Dueña crea su carta desde cero (categoría → plato → receta con un insumo
// nuevo → precio distinto en una sucursal) y luego mueve inventario.

async function pin(page: Page, code: string) {
  await page.goto("/login");
  for (const d of code) await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
}

async function selectBranch(page: Page, name: string) {
  const value = await page.locator("#branch-select option", { hasText: name }).first().getAttribute("value");
  await page.locator("#branch-select").selectOption(value!);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("wayra-tour-seen", JSON.stringify({ dueno: true, saas: true, admin: true, mesero: true }));
    localStorage.setItem("wayra-install-dismissed", "1");
    localStorage.setItem("wayra-legal-accepted", JSON.stringify({ terminos: "2026-10", privacidad: "2026-09", encargo: "2026-09" }));
  });
  await pin(page, "1111");
});

test("crear categoría, plato, receta y precio por sucursal", async ({ page }) => {
  await page.goto("/pos/editor");
  await page.getByRole("button", { name: "＋ Categoría" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("Ej. Ceviches").fill("Postres caseros");
  await dlg.getByRole("button", { name: "🍮" }).click();
  await dlg.getByRole("button", { name: "Crear categoría" }).click();
  await page.getByRole("button", { name: /Postres caseros/ }).click();
  await expect(page.getByText("Esta categoría aún no tiene platos.")).toBeVisible();

  await page.getByRole("button", { name: "＋ Plato" }).click();
  await dlg.getByPlaceholder("Ej. Lomo saltado").fill("Suspiro limeño");
  await dlg.getByLabel("Precio").fill("14");
  await dlg.getByRole("button", { name: /Crear y seguir con la receta/ }).click();

  // Receta: insumo nuevo creado ahí mismo, con cantidad decimal.
  await expect(dlg.getByRole("tab", { name: "Receta y costo" })).toHaveAttribute("aria-selected", "true");
  await dlg.getByRole("button", { name: "＋ Crear insumo nuevo" }).click();
  await dlg.getByPlaceholder("Ej. Cebolla roja").fill("Leche condensada");
  await dlg.getByRole("combobox").last().selectOption("lata");
  await dlg.getByPlaceholder("0.00").fill("6");
  await dlg.getByRole("button", { name: "Crear", exact: true }).click();
  const qty = dlg.getByLabel("Cantidad de Leche condensada");
  await qty.fill("0.25");
  await expect(qty).toHaveValue("0.25");
  await expect(dlg.getByText(/Costo por porción\s*S\/\s*1\.50/)).toBeVisible();
  await dlg.getByRole("button", { name: "Guardar receta" }).click();
  await expect(dlg).toHaveCount(0);

  await expect(page.getByText("Suspiro limeño")).toBeVisible();
  await expect(page.getByText(/Costo S\/\s*1\.50/)).toBeVisible();

  // Precio distinto en San Isidro.
  await page.getByRole("button", { name: /Suspiro limeño/ }).first().click();
  await dlg.getByRole("tab", { name: "Por sucursal" }).click();
  await dlg.getByLabel("Precio en San Isidro").fill("16");
  await dlg.getByLabel("Precio en San Isidro").blur();
  await expect(dlg.getByText("✓ Guardado")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("🏬 1 sucursal distinta")).toBeVisible();

  // En el POS de San Isidro el plato se vende a 16; en Miraflores a 14.
  await selectBranch(page, "San Isidro");
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Mesas" }).click();
  await page.getByRole("button", { name: /Libre/ }).first().click();
  await page.getByRole("button", { name: /Postres caseros/ }).first().click();
  const card = page.locator("div", { has: page.getByRole("button", { name: "Agregar Suspiro limeño" }) }).last();
  await expect(card).toContainText("16.00");
});

test("inventario: crear insumo, registrar compra y trasladar a otra sucursal", async ({ page }) => {
  await page.goto("/pos/inventario");
  await page.getByRole("button", { name: "＋ Insumo" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("Ej. Pescado fresco").fill("Pulpa de maracuyá");
  await dlg.getByLabel("Unidad de medida").fill("atado");
  await dlg.getByPlaceholder("0.00").fill("8");
  await dlg.getByPlaceholder("Ej. 10").fill("5");
  await dlg.getByRole("button", { name: "Crear insumo" }).click();
  await expect(dlg).toHaveCount(0);

  // Un nombre repetido se avisa en vez de duplicar.
  await page.getByRole("button", { name: "＋ Insumo" }).click();
  await dlg.getByPlaceholder("Ej. Pescado fresco").fill("pulpa de maracuya ");
  await dlg.getByRole("button", { name: "Crear insumo" }).click();
  await expect(dlg.getByRole("alert")).toContainText("Ya existe");
  await dlg.getByRole("button", { name: "Cancelar" }).click();

  await selectBranch(page, "Miraflores");
  await page.getByRole("button", { name: "Registrar compra de Pulpa de maracuyá" }).click();
  await dlg.getByLabel(/Cantidad \(atado\)/).fill("6");
  await dlg.getByPlaceholder("S/ 0.00").fill("45");
  await expect(dlg.getByText(/Nuevo costo: S\/\s*7\.50 por atado/)).toBeVisible();
  await dlg.getByRole("button", { name: "Registrar compra" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pulpa de maracuyá/ }).first()).toContainText("6 atado");

  await page.getByRole("button", { name: "⇄ Trasladar" }).click();
  await dlg.getByLabel("Insumo").selectOption({ label: "Pulpa de maracuyá (atado)" });
  await expect(dlg.getByLabel("Hacia").locator("option:checked")).toContainText("San Isidro"); // destino sugerido
  await dlg.getByLabel(/Cantidad a enviar/).fill("2.5");
  await dlg.getByRole("button", { name: "Trasladar" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pulpa de maracuyá/ }).first()).toContainText("3.5 atado");

  await page.getByRole("tab", { name: "Movimientos" }).click();
  await expect(page.getByText("-2.5 atado")).toBeVisible();
  await selectBranch(page, "San Isidro");
  await expect(page.getByText("+2.5 atado")).toBeVisible();
});

test("reportes: consolidado del árbol con rama y detalle", async ({ page }) => {
  // Una venta en San Isidro.
  await selectBranch(page, "San Isidro");
  await page.goto("/pos/mesas");
  await page.getByRole("button", { name: /Libre/ }).first().click();
  await page.getByRole("button", { name: /^Agregar / }).first().click();
  await page.getByRole("complementary", { name: "Ticket del pedido" }).getByRole("button", { name: "Cobrar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar pago" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar pago y emitir" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /Emitir/ })).toBeVisible();

  await page.goto("/pos/reportes");
  await expect(page.getByRole("heading", { name: "Consolidado por sucursal" })).toBeVisible();
  const card = page;
  await expect(card.getByRole("row", { name: /Total empresa/ })).toBeVisible();
  await card.getByRole("button", { name: /Abrir Miraflores/ }).click();
  await expect(card.getByRole("row", { name: /Miraflores \(solo este local\)/ })).toBeVisible();
  const si = card.getByRole("row", { name: /San Isidro/ });
  await expect(si).not.toContainText("S/ 0.00 0");
  await si.click();
  await expect(card.getByText("Detalle · San Isidro")).toBeVisible();
  await page.screenshot({ path: "/tmp/claude-0/-home-claude-repo/83856eb5-9f83-5c19-bf71-041a9af25c6e/scratchpad/shots/consolidado.png", fullPage: true });
});
