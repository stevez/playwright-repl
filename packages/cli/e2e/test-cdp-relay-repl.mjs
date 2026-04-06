#!/usr/bin/env node
/**
 * Interactive CDP Relay REPL — connects to existing browser with Dramaturg.
 *
 * Usage:
 *   node packages/cli/e2e/test-cdp-relay-repl.mjs
 *
 * Then in Chrome SW DevTools:
 *   chrome.storage.local.set({ cdpRelayPort: 9877 })
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
  console.log('Waiting for extension to connect...');
  console.log('Run in Chrome SW DevTools:  chrome.storage.local.set({ cdpRelayPort: 9877 })\n');

  await relay.waitForExtension(120000);
  console.log('Extension connected!\n');

  await new Promise(r => setTimeout(r, 500));

  console.log('Connecting Playwright via connectOverCDP...');
  let browser, page;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 30000, isLocal: true });
    console.log('✓ Connected!');

    const contexts = browser.contexts();
    console.log(`Contexts: ${contexts.length}`);
    for (const ctx of contexts) {
      const pages = ctx.pages();
      console.log(`  Pages: ${pages.length}`);
      for (const p of pages) {
        console.log(`    - url="${p.url()}" mainFrame=${!!p.mainFrame()}`);
      }
      if (pages.length > 0) page = pages[0];
    }

    if (page) {
      console.log('\n--- Testing page operations ---');

      // Test 1: page.url()
      console.log(`1. page.url() = "${page.url()}"`);

      // Test 2: page.title() with timeout
      console.log('2. Testing page.title() (10s timeout)...');
      try {
        const title = await Promise.race([
          page.title(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT: page.title() took >10s')), 10000))
        ]);
        console.log(`   ✓ page.title() = "${title}"`);
      } catch (e) {
        console.error(`   ✗ page.title() failed: ${e.message}`);

        // Test 3: Try direct evaluate as fallback
        console.log('3. Testing page.evaluate() directly (5s timeout)...');
        try {
          const title2 = await Promise.race([
            page.evaluate(() => document.title),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
          ]);
          console.log(`   ✓ page.evaluate() = "${title2}"`);
        } catch (e2) {
          console.error(`   ✗ page.evaluate() failed: ${e2.message}`);
        }

        // Test 4: Check CDP session directly
        console.log('4. Testing CDP session directly...');
        try {
          const cdp = await page.context().newCDPSession(page);
          const dom = await Promise.race([
            cdp.send('DOM.getDocument'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
          ]);
          console.log(`   ✓ DOM.getDocument root nodeId=${dom.root.nodeId}`);
        } catch (e3) {
          console.error(`   ✗ CDP session failed: ${e3.message}`);
        }
      }
    }
  } catch (err) {
    console.error('connectOverCDP failed:', err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  }

  // REPL
  let context = browser?.contexts()[0];
  console.log('\n--- CDP Relay REPL ---');
  console.log('Globals: browser, context, page, relay');
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
