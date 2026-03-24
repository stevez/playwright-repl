/**
 * Test Runner
 *
 * Discovers and executes Playwright test files via bridge mode.
 * Reads playwright.config.ts for configuration.
 *
 * Phase 1: single worker, basic config, list reporter.
 */

import path from 'node:path';
import fs from 'node:fs';
import { BridgeServer } from '@playwright-repl/core';
import { parseArgs } from './args.js';
import { loadConfig } from './config.js';
import { discoverTests } from './discover.js';
import { executeTestFile } from './execute.js';
import type { RunOptions, TestResult } from './types.js';

export async function run(args: string[]): Promise<number> {
  const opts = parseArgs(args);
  const config = await loadConfig(opts.config);

  // Merge CLI options with config
  const runOpts: RunOptions = {
    testDir: config.testDir || '.',
    timeout: opts.timeout ?? config.timeout ?? 30000,
    headed: opts.headed ?? false,
    grep: opts.grep,
    retries: opts.retries ?? config.retries ?? 0,
    workers: opts.workers ?? 1, // Phase 1: single worker
    baseURL: config.use?.baseURL,
  };

  console.log(`\npw test runner\n`);

  // Discover test files
  const testFiles = discoverTests(runOpts.testDir, opts.filter);
  if (testFiles.length === 0) {
    console.log('No test files found.');
    return 1;
  }
  console.log(`Found ${testFiles.length} test file(s)\n`);

  // Start bridge on random port (avoids conflicts with VS Code extension or other instances)
  const bridge = new BridgeServer();
  await bridge.start(0);
  const bridgePort = bridge.port;

  // Launch Chromium with extension — returns context + the active page
  const { launchBrowser } = await import('./browser.js');
  const { context, page: nodePage } = await launchBrowser({ headed: runOpts.headed, bridgePort });

  // Wait for extension to connect
  await bridge.waitForConnection(30000);
  console.log('Browser connected.\n');

  // Run test files
  const allResults: TestResult[] = [];
  let failed = 0;
  const startTime = Date.now();

  for (const file of testFiles) {
    // context = for route/unroute (context-level), nodePage = for waitForEvent (CDP page)
    const results = await executeTestFile(file, bridge, runOpts, context, nodePage);
    allResults.push(...results);
    for (const r of results) {
      if (r.passed) {
        console.log(`  \u2713 ${r.name} (${r.duration}ms)`);
      } else {
        console.log(`  \u2717 ${r.name} (${r.duration}ms)`);
        if (r.error) console.log(`    ${r.error}`);
        failed++;
      }
    }
  }

  // Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed = allResults.filter(r => r.passed).length;
  const skipped = allResults.filter(r => r.skipped).length;
  console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped (${totalTime}s)\n`);

  // Cleanup
  await bridge.close();

  return failed > 0 ? 1 : 0;
}
