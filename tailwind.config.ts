import type { Config } from "tailwindcss";

/**
 * Nocturne design system.
 * Colors resolve to CSS variables defined in src/styles/tokens.css so the same
 * class works in both light and dark themes. Semantic status colors are fixed
 * (they carry meaning on the floor plan / KDS) and don't flip with the theme.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Theme-aware surfaces (var-driven)
        bg: "var(--bg)",
        panel: "var(--panel)",
        surface: "var(--surface)",
        "surface-alt": "var(--surface-alt)",
        border: "var(--border)",
        "border-soft": "var(--border-soft)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        "chip-bg": "var(--chip-bg)",
        shell: "var(--shell)",
        // Brand accent (blurple) — fixed across themes
        accent: {
          DEFAULT: "#9184d9",
          light: "#a99fe2",
          600: "#7d6fce",
        },
        // Semantic status — fixed across themes
        success: "#3f7d5c",
        warning: "#b8863a",
        neutral: "#6b7280",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        // Nocturne scale (replaces the prototype's ad-hoc 6-20px picks)
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "14px",
        xl: "18px",
      },
      backgroundImage: {
        "accent-cta": "linear-gradient(150deg, #a99fe2, #9184d9)",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,.28)",
        md: "0 4px 14px rgba(0,0,0,.34)",
        lg: "0 12px 34px rgba(0,0,0,.42)",
      },
      keyframes: {
        pulseRed: {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(145,132,217,.5)" },
          "50%": { boxShadow: "0 0 0 4px rgba(145,132,217,0)" },
        },
      },
      animation: {
        pulseRed: "pulseRed 1.4s ease-in-out infinite",
      },
      screens: {
        // Prototype breakpoints: mobile rail->tabbar at 860, canvas fluid at 1320
        mob: { max: "860px" },
        canvas: { max: "1320px" },
      },
    },
  },
  plugins: [],
} satisfies Config;
