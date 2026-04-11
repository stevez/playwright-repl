import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: './coverage/unit',
      include: ['src/**/*.ts'],
      exclude: ['src/upstream/**'],
      reporter: ['text', 'json', 'lcov', 'html'],
    },
  },
  resolve: {
    alias: {
      // Stub 'vscode' module — not available outside VS Code
      'vscode': path.resolve(__dirname, 'tests/unit/vscode-stub.ts'),
    },
  },
});
