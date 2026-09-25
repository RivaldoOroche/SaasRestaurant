import { defineConfig, devices } from "@playwright/test";

// E2E en modo mock (sin Supabase): levanta Vite en :5173 con VITE_USE_MOCK=true
// y ejerce los flujos principales en un navegador real.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    // Permite apuntar a un Chromium ya instalado (p. ej. CI/entornos gestionados)
    // vía PW_EXECUTABLE_PATH; si no se define, Playwright usa el navegador que instala.
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { VITE_USE_MOCK: "true" },
  },
});
