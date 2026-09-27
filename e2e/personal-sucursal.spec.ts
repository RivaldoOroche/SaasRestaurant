import { test, expect, type Page } from "@playwright/test";

// Personal por sucursal: al asignar a Ana solo a San Isidro, al entrar con su
// PIN solo ve y opera esa sucursal.

async function pin(page: Page, code: string) {
  await page.goto("/login");
  for (const d of code) await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
}

test("asignar sucursal a una persona limita lo que ve al entrar con PIN", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("wayra-tour-seen", JSON.stringify({ dueno: true, saas: true, admin: true, mesero: true }));
    localStorage.setItem("wayra-install-dismissed", "1");
    localStorage.setItem("wayra-legal-accepted", JSON.stringify({ terminos: "2026-09", privacidad: "2026-09", encargo: "2026-09" }));
  });
  await pin(page, "1111");
  await page.goto("/pos/personal");
  await page.getByRole("button", { name: "Sucursales de Ana Ruiz" }).click();
  await page.getByRole("dialog").getByLabel("San Isidro").check();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("🏬 San Isidro")).toBeVisible();

  // Un PIN repetido se rechaza con un mensaje claro.
  await page.getByRole("button", { name: "＋ Agregar persona" }).click();
  await page.getByRole("dialog").getByPlaceholder("Ej. Rosa Quispe").fill("Rosa Quispe");
  await page.getByRole("dialog").getByLabel("PIN de 4 dígitos").fill("3333");
  await page.getByRole("dialog").getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Ese PIN ya lo usa Ana Ruiz");
  await page.getByRole("dialog").getByLabel("PIN de 4 dígitos").fill("5678");
  await page.getByRole("dialog").getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Rosa Quispe")).toBeVisible();

  // Cambiar de usuario → Ana.
  await page.getByRole("button", { name: "Cambiar de usuario" }).first().click();
  await pin(page, "3333");
  await page.goto("/pos/mesas");
  // Una sola sucursal: no hay selector y las mesas son las de San Isidro (13-20).
  await expect(page.locator("#branch-select")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Mesa \d+/ }).first()).toBeVisible();
  const labels = await page.getByRole("button", { name: /^Mesa \d+/ }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  const numbers = labels.map((t) => Number(t.match(/\d+/)![0]));
  expect(numbers.length).toBeGreaterThan(0);
  expect(numbers.every((n) => n >= 13)).toBe(true);
});
