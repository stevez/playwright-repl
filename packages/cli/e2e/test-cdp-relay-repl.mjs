#!/usr/bin/env node
/**
 * Interactive CDP Relay REPL.
 *
 * Starts a CDP relay server and waits for the Dramaturg extension to connect.
 * Then connects Playwright via connectOverCDP and drops into an interactive REPL.
 *
 * Steps:
 * 1. Run this script
 * 2. Load the extension in Chrome (chrome://extensions → Load unpacked → packages/extension/dist)
 * 3. The extension auto-connects to port 9877
 * 4. Playwright connects via CDP relay
 * 5. Type commands in the REPL
 *
 * Usage:
 *   node packages/cli/e2e/test-cdp-relay-repl.mjs
 */

import { chromium } from 'playwright';
import { CdpRelay } from '@playwright-repl/core';
import readline from 'node:readline';

const CDP_PORT = 9877;

async function main() {
  const relay = new CdpRelay();
  await relay.start(CDP_PORT);
  console.log(`CDP relay started on port ${CDP_PORT}`);
  console.log(`WebSocket: ${relay.wsUrl}\n`);
  console.log('Waiting for Dramaturg extension to connect...');
  console.log('(Load the extension in Chrome if not already loaded)\n');

  await relay.waitForExtension(120000);
  console.log('Extension connected!\n');

  await new Promise(r => setTimeout(r, 1000));

  console.log('Connecting Playwright via connectOverCDP...');
  let browser, page;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    console.log('✓ Connected!');

    const contexts = browser.contexts();
    console.log(`Contexts: ${contexts.length}`);
    for (const ctx of contexts) {
      const pages = ctx.pages();
      console.log(`  Pages: ${pages.length}`);
      for (const p of pages) {
        console.log(`    - ${p.url()}`);
      }
      if (pages.length > 0) page = pages[0];
    }
  } catch (err) {
    console.error('connectOverCDP failed:', err.message);
  }

  // Expose variables for eval
  let context = browser?.contexts()[0];

  console.log('\n--- CDP Relay REPL ---');
  console.log('Globals: browser, context, page, relay');
  console.log('Try: browser.contexts().length, context?.pages().length');
  console.log('Type .pages to refresh page list');
  console.log('Type .quit to exit\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'cdp> ' });
  rl.prompt();

  rl.on('line', async (line) => {
    const cmd = line.trim();
    if (cmd === '.quit' || cmd === '.exit') { rl.close(); return; }
    if (!cmd) { rl.prompt(); return; }
    if (cmd === '.pages') {
      context = browser?.contexts()[0];
      const pages = context?.pages() || [];
      console.log(`Pages: ${pages.length}`);
      pages.forEach((p, i) => console.log(`  [${i}] ${p.url()}`));
      if (pages.length > 0) page = pages[0];
      rl.prompt();
      return;
    }

    try {
      const result = await eval(`(async () => { return ${cmd}; })()`);
      if (result !== undefined) console.log(result);
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
    rl.prompt();
  });

  rl.on('close', async () => {
    console.log('\nCleaning up...');
    await browser?.close().catch(() => {});
    await relay.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
