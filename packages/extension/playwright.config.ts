import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 60000,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  projects: [
    {
      name: 'commands',
      testDir: './e2e',
      testIgnore: '**/bridge/**',
    },
    {
      // Bridge tests must run separately: they start a WebSocket server on port 9876,
      // and any other extension instance would also connect to it, causing interference.
      name: 'bridge',
      testDir: './e2e/bridge',
      dependencies: ['commands'],
    },
  ],
});
