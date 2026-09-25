// ESLint (flat config) para Wayra POS. TypeScript + React, sin exigir tipos
// (rápido en CI). Las Edge Functions son Deno; se relajan reglas allí.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "landing/**",
      "public/**",
      "project/**", // bundle de diseño (prototipo), no es código de la app
      "*.config.js",
      "*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      // Se usa el patrón `cond ? a() : b()` para efectos secundarios en algunos sitios.
      "@typescript-eslint/no-unused-expressions": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    // Edge Functions (Deno) + módulos compartidos del backend.
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: { ...globals.deno, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
