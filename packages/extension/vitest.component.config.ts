import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/panel')
    }
  },
  optimizeDeps: {
    include: ['vitest-browser-react'],
  },
  test: {
    globals: true,
    setupFiles: ['./test/components/vitest.browser.setup.ts'],
    include: ['test/components/**/*.browser.test.{ts,tsx}'],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: './coverage/component',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [],
      reporter: ['text', 'json', 'lcov', 'html'],
    },
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
});
