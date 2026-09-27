import { test, expect, type Page } from "@playwright/test";

// Sin internet el mesero sigue trabajando: agrega platos, envía la comanda
// (con opción de imprimirla), recarga la app y no pierde nada; al volver la
// conexión todo se sincroniza con el servidor (en la demo, MockRepo).

async function login(page: Page, pin: string) {
  await page.addInitScript(() => {
    localStorage.setItem("wayra-tour-seen", JSON.stringify({ dueno: true, saas: true, admin: true, mesero: true }));
    localStorage.setItem("wayra-install-dismissed", "1");
    localStorage.setItem("wayra-legal-accepted", JSON.stringify({ terminos: "2026-10", privacidad: "2026-09", encargo: "2026-09" }));
  });
  await page.goto("/login");
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
}

const ticketLines = (page: Page) => page.getByRole("complementary", { name: "Ticket del pedido" }).getByRole("listitem");

/** Líneas del pedido de la mesa en el "servidor" de la demo. */
async function serverLines(page: Page, tableNumber: number): Promise<number> {
  return page.evaluate((n) => {
    const s = JSON.parse(localStorage.getItem("nubepos-mock-v5") ?? "{}");
    const table = (s.tables ?? []).find((t: { number: number }) => t.number === n);
    const order = (s.orders ?? []).find(
      (o: { tableId: string; status: string }) => o.tableId === table?.id && o.status !== "cobrada" && o.status !== "anulada",
    );
    return order?.lines?.length ?? 0;
  }, tableNumber);
}

test("sin conexión: tomar pedido, enviar comanda, recargar y sincronizar al volver", async ({ page }) => {
  await login(page, "3333"); // mesero
  await page.goto("/pos/mesas");
  const mesa = page.getByRole("button", { name: /Libre/ }).first();
  const tableNumber = Number((await mesa.innerText()).match(/\d+/)![0]);
  await mesa.click();
  await expect(page).toHaveURL(/\/pos\/pedido/);
  await page.getByRole("button", { name: /^Agregar / }).first().click();
  await expect.poll(() => serverLines(page, tableNumber)).toBe(1);

  // Pasar a "Trabajar sin conexión" desde el panel de sincronización.
  await page.getByRole("button", { name: /^Conexión:/ }).click();
  await page.getByRole("button", { name: "Trabajar sin conexión" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByText(/Sin conexión — sigue tomando pedidos/)).toBeVisible();

  // Un plato más y la comanda: se ven al instante, pero el servidor aún no los tiene.
  await page.getByRole("button", { name: /^Agregar / }).nth(1).click();
  await expect(ticketLines(page)).toHaveCount(2);
  await page.getByRole("button", { name: /Enviar a cocina/ }).first().click();
  await expect(page.getByRole("heading", { name: "Comanda guardada sin conexión" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByText(/cambios se sincronizarán solos/)).toBeVisible();
  expect(await serverLines(page, tableNumber)).toBe(1);

  // Recargar sin red: el pedido y la cola siguen ahí.
  await page.reload();
  await expect(page.getByText(/Sin conexión — sigue tomando pedidos/)).toBeVisible();
  await expect(ticketLines(page)).toHaveCount(2);

  // Volver en línea: la cola se envía sola y el servidor queda igual que la pantalla.
  await page.getByRole("button", { name: /^Conexión:/ }).click();
  await page.getByRole("button", { name: "Volver a trabajar en línea" }).click();
  await expect(page.getByRole("dialog").getByText("En línea · todo sincronizado")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
  await expect.poll(() => serverLines(page, tableNumber)).toBe(2);

  // La comanda llegó a cocina.
  await page.goto("/pos/cocina");
  await expect(page.getByText(`Mesa ${tableNumber}`).first()).toBeVisible();
});
