#!/usr/bin/env node
/**
 * POC: Interactive REPL using serviceWorker.evaluate() — no bridge.
 *
 * Usage: node packages/extension/e2e/poc-repl.mjs
 *        node packages/extension/e2e/poc-repl.mjs --headless
 */

import { chromium } from 'playwright';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const headless = process.argv.includes('--headless');

async function main() {
  console.log('Launching Chromium with Dramaturg extension...');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');

  // Navigate to blank page and attach
  const page = context.pages()[0] || await context.newPage();
  await page.goto('about:blank');
  await new Promise(r => setTimeout(r, 500));

  console.log('Ready. Type commands (goto, snapshot, click, fill, press, screenshot, etc.)');
  console.log('Type .exit to quit.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'pw> ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const cmd = line.trim();
    if (!cmd) { rl.prompt(); return; }
    if (cmd === '.exit' || cmd === '.quit') { rl.close(); return; }
    if (cmd === '.clear') { console.clear(); rl.prompt(); return; }

    try {
      const result = await sw.evaluate(async (command) => {
        return await self.handleBridgeCommand({ command, scriptType: 'command' });
      }, cmd);

      if (result.image) {
        console.log('[screenshot captured]');
      } else if (result.text) {
        if (result.isError) {
          console.log(`\x1b[31m${result.text}\x1b[0m`);
        } else {
          console.log(result.text);
        }
      }
    } catch (err) {
      console.log(`\x1b[31m${err.message}\x1b[0m`);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    console.log('\nClosing...');
    await context.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
