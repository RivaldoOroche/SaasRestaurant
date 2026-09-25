import { test, expect } from "@playwright/test";

test.describe("Wayra POS — humo (modo mock)", () => {
  test("la pantalla de login se muestra", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Wayra/i })).toBeVisible();
    // Teclado de PIN presente.
    await expect(page.getByRole("button", { name: "0", exact: true })).toBeVisible();
  });

  test("inicio de sesión con PIN (SaaS 0000) entra a la consola", async ({ page }) => {
    await page.goto("/login");
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "0", exact: true }).click();
    }
    // Al autenticarse aparece la barra de navegación con su landmark accesible.
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
  });

  test("la página pública de estado responde", async ({ page }) => {
    await page.goto("/estado");
    await expect(page.getByText(/Estado del sistema/i)).toBeVisible();
    await expect(page.getByText(/operativos|operativo/i).first()).toBeVisible();
  });
});
