import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export const setupIntegrationTests = [
  "src/setups/cycle2AdvancedQb.test.ts",
  "src/setups/cycle2Context.test.ts",
  "src/setups/cycle3Context.test.ts",
  "src/setups/cycle4Context.test.ts",
  "src/setups/cycle5Context.test.ts",
  "src/setups/cycle6Context.test.ts",
  "src/setups/cycle7Context.test.ts",
  "src/setups/query.test.ts",
];

export default defineConfig({
  plugins: [react()],
  // Limit dependency discovery to the two production entry points.
  optimizeDeps: {
    entries: ["index.html", "replay.html"],
  },
  build: {
    rollupOptions: {
      input: { game: "index.html", replay: "replay.html" },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: setupIntegrationTests,
  },
});
