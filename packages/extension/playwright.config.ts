import { defineConfig } from '@playwright/test'
import type { NextcovConfig } from 'nextcov';


// Nextcov configuration
export const nextcov: NextcovConfig = {
  outputDir: 'coverage/e2e',
  sourceRoot: './src',
  collectServer: false,  // Client-only mode
  include: ['src/**/*.{ts,tsx,js,jsx}'],
  exclude: [
    'src/**/__tests__/**',
    'src/**/*.test.{ts,tsx}',
    'src/**/*.spec.{ts,tsx}',
    'src/panel/lib/locator/**',
  ],
  reporters: ['html', 'lcov', 'json', 'text-summary'],
}

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  testDir: './e2e',
  testIgnore: ['**/commands/**', '**/bridge/**'],
  timeout: 60000,
  retries: 0,
  workers: undefined,  // default parallelism (bridge tests that needed workers:1 are skipped)
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
});
