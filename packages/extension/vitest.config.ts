import { defineConfig } from "vitest/config";
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/panel')
      }
    },
    optimizeDeps: {
      include: ['vitest-browser-react'],
    },
  test: {
    setupFiles: "./test/setup.ts",
    environment: "happy-dom",
    exclude: ["e2e/**", "test/components/**","node_modules/**", "dist/**"],
    coverage: {
      enabled: true,
      provider: "v8",
      reportsDirectory: './coverage/unit',
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/panel/lib/locator/**"],
      reporter: ["text", "json", "lcov", "html"],
    },
  },
});
