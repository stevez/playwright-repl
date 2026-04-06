#!/usr/bin/env node
/**
 * CDP Relay prototype test.
 *
 * 1. Start CDP relay server (9877)
 * 2. Launch Chrome with Dramaturg extension
 * 3. Tell extension to connect to CDP relay
 * 4. Playwright connectOverCDP to the relay
 * 5. Try page.title(), page.goto(), etc.
 *
 * Usage:
 *   node packages/cli/e2e/test-cdp-relay.mjs
 *   node packages/cli/e2e/test-cdp-relay.mjs --headed
 */

import { chromium } from 'playwright';
import { CdpRelay } from '@playwright-repl/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../extension/dist');
const headed = process.argv.includes('--headed');
const CDP_PORT = 9877;

async function main() {
  // 1. Start CDP relay
  const relay = new CdpRelay();
  await relay.start(CDP_PORT);
  console.log(`CDP relay on ${relay.wsUrl}`);

  // 2. Launch Chrome with extension
  console.log('Launching Chrome with Dramaturg extension...');
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

  // Get extension ID and configure CDP relay port
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = sw.url().split('/')[2];

  // Set CDP relay port via SW evaluate (don't open panel — avoid playwright-crx attaching)
  await sw.evaluate((p) => chrome.storage.local.set({ cdpRelayPort: p }), CDP_PORT);
  const [page1] = context.pages();
  await page1.goto('https://demo.playwright.dev/todomvc/');
  await page1.bringToFront();

  // Wait for extension to connect to CDP relay
  console.log('Waiting for extension to connect to CDP relay...');
  await relay.waitForExtension(15000);
  console.log('Extension connected!');

  // Small delay for stability
  await new Promise(r => setTimeout(r, 1000));

  // 3. Connect Playwright via CDP relay
  console.log(`\nConnecting Playwright via connectOverCDP(http://127.0.0.1:${CDP_PORT})...`);
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { isLocal: true });
    console.log('✓ Connected via CDP relay');

    const contexts = browser.contexts();
    console.log(`  Contexts: ${contexts.length}`);

    if (contexts.length > 0) {
      const pages = contexts[0].pages();
      console.log(`  Pages: ${pages.length}`);

      if (pages.length > 0) {
        const page = pages[0];
        const title = await page.title();
        console.log(`  Page title: "${title}"`);

        await page.goto('https://demo.playwright.dev/todomvc/');
        const newTitle = await page.title();
        console.log(`  After navigate: "${newTitle}"`);

        console.log('\n✅ CDP relay prototype works!');
      } else {
        console.log('\n⚠ No pages found — Target.setAutoAttach may need fixing');
      }
    } else {
      console.log('\n⚠ No contexts found');
    }

    await browser.close().catch(() => {});
  } catch (err) {
    console.error('\n❌ CDP relay failed:', err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  }

  // Cleanup
  await Promise.race([context.close(), new Promise(r => setTimeout(r, 3000))]).catch(() => {});
  await relay.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
