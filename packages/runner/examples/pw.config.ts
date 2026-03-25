import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 15000,
  workers: 4,
  fullyParallel: true,
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
