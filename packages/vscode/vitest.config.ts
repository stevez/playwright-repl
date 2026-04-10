import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      // Stub 'vscode' module — not available outside VS Code
      'vscode': path.resolve(__dirname, 'tests/unit/vscode-stub.ts'),
    },
  },
});
