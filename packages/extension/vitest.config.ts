import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: "./test/setup.ts",
    environment: "happy-dom",
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
    },
  },
});
