import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { setupTestVitePlugin } from "./vite/setupTestVitePlugin";

export default defineConfig({
  plugins: [setupTestVitePlugin(), react()],
  // Limit dependency discovery to the declared HTML entry points.
  optimizeDeps: {
    entries: ["index.html", "replay.html", "setup_test.html"],
  },
  build: {
    rollupOptions: {
      input: { game: "index.html", replay: "replay.html", setupTest: "setup_test.html" },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
