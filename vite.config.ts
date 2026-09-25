/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
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
