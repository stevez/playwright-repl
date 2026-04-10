import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Stub 'vscode' module — not available outside VS Code
      'vscode': path.resolve(__dirname, 'test/vscode-stub.ts'),
    },
  },
});
