import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves the site at shawnkoski.com/cross-stitch/
  base: "/cross-stitch/",
  plugins: [react()],
  test: {
    projects: [
      {
        // The pattern and text logic: plain functions, no DOM
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" },
      },
      {
        // The whole tool, in real Chromium, with axe
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "chromium" }] },
        },
      },
    ],
  },
});
