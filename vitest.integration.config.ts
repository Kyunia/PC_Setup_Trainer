import { defineConfig } from "vitest/config";
import { setupIntegrationTests } from "./vite.config";

export default defineConfig({
  test: {
    environment: "node",
    include: setupIntegrationTests,
  },
});
