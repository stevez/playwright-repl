import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  // Bridge tests start a WebSocket server on port 9876; any parallel extension
  // instance would also connect to it, causing interference. Run sequentially.
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
});
