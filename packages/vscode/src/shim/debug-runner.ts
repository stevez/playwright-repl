/**
 * Debug Runner
 *
 * Runs a test file with real Playwright via connectOverCDP.
 * Used for debugging compiler mode tests — slower but full debugging support.
 *
 * Usage: node debug-runner.mjs <test-file> <cdp-port>
 *
 * This file is compiled by esbuild into the temp debug file.
 * It provides real page/context/expect objects connected to the running Chrome.
 */

// These are injected by the esbuild wrapper
declare const __testFileName: string;
declare const __cdpPort: number;

import { chromium } from 'playwright-core';

// Connect to the already-running Chrome
const browser = await chromium.connectOverCDP(`http://localhost:${__cdpPort}`);
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();

// Make page/context available as globals for the test
(globalThis as any).page = page;
(globalThis as any).context = context;

// Import the test file — it will register tests via our shim
await import(`./${__testFileName}`);

// Run all registered tests with real Playwright fixtures
const { __runTests } = await import('@playwright/test');
const result = await __runTests();
console.log(result);

// Disconnect (don't close — browser stays running)
await browser.close();
process.exit(0);
