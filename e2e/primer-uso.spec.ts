import { test, expect, type Page } from "@playwright/test";

// Primer uso: el dueño aterriza en Inicio con la guía de primeros pasos; el
// mesero, directo en Mesas. El recorrido de bienvenida aparece una vez.

async function pin(page: Page, code: string) {
  await page.goto("/login");
  for (const d of code) await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("wayra-install-dismissed", "1");
    localStorage.setItem("wayra-legal-accepted", JSON.stringify({ terminos: "2026-10", privacidad: "2026-09", encargo: "2026-09" }));
  });
});

test("dueño: bienvenida, Inicio con primeros pasos que llevan a cada pantalla", async ({ page }) => {
  await pin(page, "1111");
  const tour = page.getByRole("dialog");
  await expect(tour.getByRole("heading", { name: "Bienvenido a Wayra POS" })).toBeVisible();
  await tour.getByRole("button", { name: "Omitir" }).click();
  await expect(page.getByRole("heading", { name: "Hola, Mónica" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Primeros pasos" })).toBeVisible();
  await page.getByRole("link", { name: /Abre la caja del día/ }).click();
  await expect(page).toHaveURL(/\/pos\/caja$/);
  // Una vez omitido, no vuelve a aparecer.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bienvenido a Wayra POS" })).toHaveCount(0);
});

test("mesero: entra directo a Mesas y ve su recorrido corto", async ({ page }) => {
  await pin(page, "3333");
  await expect(page).toHaveURL(/\/pos\/mesas$/);
  const tour = page.getByRole("dialog");
  await tour.getByRole("button", { name: "Siguiente" }).click();
  await expect(tour.getByRole("heading", { name: "Atiende una mesa" })).toBeVisible();
  await tour.getByRole("button", { name: "Omitir" }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Inicio" })).toHaveCount(0);
});
