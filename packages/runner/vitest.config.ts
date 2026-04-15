import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['examples/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'html'],
    },
  },
});
