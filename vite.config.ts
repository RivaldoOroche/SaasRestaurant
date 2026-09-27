/// <reference types="vitest/config" />
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { fileURLToPath, URL } from "node:url";

// Versión que identifica cada despliegue en los reportes de error.
process.env.VITE_APP_VERSION ??= (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "dev").slice(0, 12);

// Source maps a Sentry solo si hay credenciales (CI/Vercel). Los .map no se
// publican: se suben a Sentry y se borran del build.
const sentryUpload = !!process.env.SENTRY_AUTH_TOKEN && !!process.env.SENTRY_ORG && !!process.env.SENTRY_PROJECT;
const plugins: PluginOption[] = [react()];
if (sentryUpload) {
  plugins.push(
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.VITE_APP_VERSION },
      sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
      telemetry: false,
    }),
  );
}

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    sourcemap: sentryUpload ? "hidden" : false,
  },
  server: {
    host: true,
    port: 5173,
  },
  // Vitest: los e2e (Playwright, e2e/*.spec.ts) se ejecutan aparte, no aquí.
  test: {
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
