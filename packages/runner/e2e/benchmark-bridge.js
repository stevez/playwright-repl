#!/usr/bin/env node
/**
 * Benchmark: run todomvc spec files via bridge mode (direct execution).
 *
 * Launches Chrome with the extension, connects via BridgeServer,
 * compiles each spec file with esbuild, and sends the compiled script
 * to the extension's service worker for execution.
 *
 * This is the same path VS Code uses in "direct bridge" mode.
 *
 * Usage:  node packages/runner/e2e/benchmark-bridge.js
 *         node packages/runner/e2e/benchmark-bridge.js --headed
 */

import { BridgeServer } from '@playwright-repl/core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
const { chromium } = _require('@playwright/test');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const headed = process.argv.includes('--headed');
const EXTENSION_PATH = path.resolve(__dirname, '../../extension/dist');
const TODOMVC_DIR = path.resolve(__dirname, '../examples/todomvc');

function findSpecFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findSpecFiles(full));
    else if (entry.name.endsWith('.spec.ts')) results.push(full);
  }
  return results;
}

async function main() {
  const totalStart = Date.now();

  // 1. Load bridge-utils (CJS)
  const bridgeUtils = _require('../dist/bridge-utils.cjs');

  // 2. Start BridgeServer
  const bridge = new BridgeServer();
  await bridge.start(0);
  console.log(`Bridge server on port ${bridge.port}`);

  // 3. Launch browser with extension
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: !headed,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  // 4. Get extension ID and set bridge port
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = sw.url().split('/')[2];

  const [page] = context.pages();
  await page.goto(`chrome-extension://${extensionId}/panel/panel.html`);
  await page.evaluate((p) => chrome.storage.local.set({ bridgePort: p }), bridge.port);
  await page.goto('https://demo.playwright.dev/todomvc/');
  await page.bringToFront();

  // 5. Wait for extension to connect
  await bridge.waitForConnection(30000);
  await new Promise(r => setTimeout(r, 500));
  console.log('Extension connected.\n');

  // 6. Find all todomvc spec files
  const specFiles = findSpecFiles(TODOMVC_DIR);
  specFiles.sort();

  // 7. Run each spec file via bridge
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const specFile of specFiles) {
    const relPath = path.relative(TODOMVC_DIR, specFile);

    // Skip files that need Node APIs
    if (bridgeUtils.needsNode(specFile)) {
      console.log(`  -  ${relPath} (skipped — needs Node)`);
      skipped++;
      continue;
    }

    // Compile
    const compiled = await bridgeUtils.compile(specFile);

    // Build script (same as VS Code direct bridge)
    let script = 'globalThis.__resetTestState();\n';
    script += 'globalThis.__setGrep(null);\n';
    script += compiled + '\n';
    script += 'await globalThis.__runTests();';

    // Execute
    const result = await bridge.runScript(script, 'javascript');
    const results = bridgeUtils.parseAllResults(result.text || '');

    // Print results
    for (const r of results) {
      if (r.status === 'passed') {
        console.log(`  ✓  ${relPath} (${r.duration}ms)`);
        passed++;
      } else if (r.status === 'skipped') {
        console.log(`  -  ${relPath} (skipped)`);
        skipped++;
      } else {
        console.log(`  ✗  ${relPath} (${r.duration}ms)`);
        if (r.errors.length) console.log(`     ${r.errors[0].message}`);
        failed++;
      }
    }

    if (result.isError && results.length === 0) {
      console.log(`  ✗  ${relPath}`);
      console.log(`     ${result.text}`);
      failed++;
    }
  }

  const totalTime = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped (${totalTime}s)\n`);

  // 8. Cleanup
  const timeout = new Promise(r => setTimeout(r, 3000));
  await Promise.race([context.close(), timeout]).catch(() => {});
  await bridge.close().catch(() => {});

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
