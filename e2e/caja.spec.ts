import { test, expect, type Page } from "@playwright/test";

// Turno de caja completo: abrir con fondo, registrar un gasto, cobrar una mesa
// en efectivo y cerrar contando; el arqueo queda en el historial.

async function login(page: Page, pin: string) {
  await page.addInitScript(() => {
    localStorage.setItem("wayra-tour-seen", JSON.stringify({ dueno: true, saas: true, admin: true, mesero: true }));
    localStorage.setItem("wayra-install-dismissed", "1");
    localStorage.setItem("wayra-legal-accepted", JSON.stringify({ terminos: "2026-09", privacidad: "2026-09", encargo: "2026-09" }));
  });
  await page.goto("/login");
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
}

test("caja: abrir, gasto, cobro en efectivo y cierre con arqueo", async ({ page }) => {
  await login(page, "2222"); // gerente
  await page.goto("/pos/caja");
  await page.getByLabel("Fondo inicial").fill("200");
  await page.getByRole("button", { name: /Abrir caja con S\/ 200.00/ }).click();
  await expect(page.getByText("Caja abierta")).toBeVisible();

  await page.getByRole("button", { name: "− Egreso / gasto" }).click();
  await page.getByLabel("Monto").fill("30");
  await page.getByRole("button", { name: "Compra de insumos" }).click();
  await page.getByRole("button", { name: /Registrar S\/ 30.00/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Compra de insumos" })).toBeVisible();

  // Cobro en efectivo de una mesa.
  await page.goto("/pos/mesas");
  await page.getByRole("button", { name: /Libre/ }).first().click();
  await page.getByRole("button", { name: /^Agregar / }).first().click();
  await page.getByRole("complementary", { name: "Ticket del pedido" }).getByRole("button", { name: "Cobrar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar pago" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar pago y emitir" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /Emitir/ })).toBeVisible();

  await page.goto("/pos/caja");
  await page.screenshot({ path: "/tmp/claude-0/-home-claude-repo/83856eb5-9f83-5c19-bf71-041a9af25c6e/scratchpad/shots/caja-abierta.png", fullPage: true });
  await page.getByRole("button", { name: "Cerrar caja" }).click();
  await page.getByLabel("Contado Efectivo").fill("170");
  await page.screenshot({ path: "/tmp/claude-0/-home-claude-repo/83856eb5-9f83-5c19-bf71-041a9af25c6e/scratchpad/shots/caja-cierre.png" });
  await page.getByRole("button", { name: "Confirmar cierre" }).click();
  await expect(page.getByRole("heading", { name: "Arqueo de caja" })).toBeVisible();
  await page.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText("Abrir caja", { exact: true })).toBeVisible();
  await expect(page.getByText("Cierres anteriores")).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  await page.screenshot({ path: "/tmp/claude-0/-home-claude-repo/83856eb5-9f83-5c19-bf71-041a9af25c6e/scratchpad/shots/caja-mobile.png", fullPage: true });
});
