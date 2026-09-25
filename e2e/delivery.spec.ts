import { test, expect } from "@playwright/test";

// Delivery punta a punta en modo mock: crear → aceptar (comanda en cocina) →
// el cliente abre su enlace de seguimiento y ve el estado sin datos sensibles.
test("delivery: crear, aceptar, ver en cocina y seguir como cliente", async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem("wayra-tour-seen", JSON.stringify({ dueno: true })));
  await page.goto("/login");
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "1", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();

  await page.goto("/pos/delivery");
  await page.getByRole("button", { name: "+ Nuevo pedido" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "WhatsApp", exact: true }).click();
  await dlg.getByLabel("Nombre del cliente").fill("Carla Mendoza");
  await dlg.getByLabel("Celular").fill("999 888 777");
  await dlg.getByLabel("Dirección").fill("Av. Arequipa 2450");
  await dlg.getByRole("button", { name: /Miraflores/ }).click();
  await dlg.getByRole("button", { name: /Lomo saltado/ }).click();
  await dlg.getByRole("button", { name: /Crear pedido/ }).click();

  await expect(dlg.getByRole("heading", { name: /Pedido creado D-\d+/ })).toBeVisible();
  const code = (await dlg.getByRole("heading").textContent())!.match(/D-\d+/)![0];
  const trackUrl = await dlg.getByLabel("Enlace de seguimiento").inputValue();
  await dlg.getByRole("button", { name: "Listo" }).click();

  // La tarjeta aparece en "Recibidos"; aceptarla la manda a cocina.
  const card = page.getByRole("article", { name: new RegExp(`${code} · Carla`) });
  await card.getByRole("button", { name: /Aceptar/ }).click();
  await expect(page.getByRole("region", { name: "En cocina" }).getByRole("article", { name: new RegExp(code) })).toBeVisible();

  await page.goto("/pos/cocina");
  await expect(page.getByText(`🛵 ${code}`)).toBeVisible();

  // El cliente abre el enlace (mismo navegador: el demo guarda el estado localmente).
  const client = await context.newPage();
  await client.goto(trackUrl.replace(/^https?:\/\/[^/]+/, ""));
  await expect(client.getByRole("heading", { name: "Estamos preparando tu pedido" })).toBeVisible();
  await expect(client.getByText(code)).toBeVisible();
  await expect(client.getByText("Av. Arequipa")).toHaveCount(0);
  await expect(client.getByText("999888777")).toHaveCount(0);
});
