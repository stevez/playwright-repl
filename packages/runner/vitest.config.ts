import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['examples/**', 'node_modules/**', 'dist/**'],
    passWithNoTests: true,
  },
});
