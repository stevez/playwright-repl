/**
 * pw launch / pw close — browser lifecycle management.
 *
 * Launches Chrome with the extension loaded and --remote-debugging-port.
 * Injects the bridge port into the extension so it knows where to connect
 * when pw repl-extension starts a BridgeServer later.
 *
 * Usage:
 *   pw launch --port 9222                    # launch Chrome + extension
 *   pw launch --port 9222 --bridge-port 9877 # custom bridge port
 *   pw close --port 9222                     # close browser via CDP
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { minimist } from '@playwright-repl/core';

const __filename = fileURLToPath(import.meta.url);
const _require = createRequire(__filename);

// ─── Extension path resolution ───────────────────────────────────────────────

function findExtensionPath(): string {
  const bundledExt = path.resolve(path.dirname(__filename), 'chrome-extension');
  const coreMain = _require.resolve('@playwright-repl/core');
  const coreDir = coreMain.replace(/[\\/]dist[\\/].*$/, '');
  const monorepoExt = path.resolve(coreDir, '../extension/dist');
  const extPath = fs.existsSync(path.join(bundledExt, 'manifest.json')) ? bundledExt : monorepoExt;
  if (!fs.existsSync(path.join(extPath, 'manifest.json')))
    throw new Error('Chrome extension not found. Run "pnpm run build" first.');
  return extPath;
}

// ─── handleLaunch ────────────────────────────────────────────────────────────

export async function handleLaunch(argv: string[]): Promise<void> {
  const args = minimist(argv, {
    boolean: ['headless'],
    string: ['port', 'bridge-port'],
    default: { port: '9222', 'bridge-port': '9877' },
  });

  const port = parseInt(args.port as string, 10);
  const bridgePort = parseInt(args['bridge-port'] as string, 10);
  const headless = args.headless as boolean;
  const extPath = findExtensionPath();

  // 1. Launch Chrome with extension
  const pw = _require('@playwright/test');
  const os = await import('node:os');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-repl-'));
  const defaultDir = path.join(userDataDir, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });
  fs.writeFileSync(path.join(defaultDir, 'Preferences'), JSON.stringify({
    devtools: { preferences: { currentDockState: '"bottom"' } },
  }));

  const browserContext = await pw.chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-infobars',
      `--remote-debugging-port=${port}`,
    ],
  });
  console.log(`Chrome launched on CDP port ${port}`);

  // 2. Inject bridge port into extension via service worker
  let sw = browserContext.serviceWorkers()[0];
  if (!sw) sw = await browserContext.waitForEvent('serviceworker', { timeout: 10000 });
  await sw.evaluate((p: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome.storage.local.set({ bridgePort: p });
  }, bridgePort);
  console.log(`Bridge port ${bridgePort} set via service worker`);

  console.log(`Ready! CDP: ${port} | Bridge: ${bridgePort}`);
  console.log('Extension will connect when BridgeServer starts (pw repl-extension).');

  // Keep alive, Ctrl+C to close
  await new Promise<void>((resolve) => {
    process.on('SIGINT', async () => {
      console.log('\nClosing...');
      await browserContext.close().catch(() => {});
      resolve();
    });
  });
}

// ─── handleClose ─────────────────────────────────────────────────────────────

export async function handleClose(argv: string[]): Promise<void> {
  const args = minimist(argv, {
    string: ['port'],
    default: { port: '9222' },
  });

  const port = parseInt(args.port as string, 10);
  const pw = _require('@playwright/test');
  const browser = await pw.chromium.connectOverCDP(`http://localhost:${port}`);
  await browser.close();
  console.log(`Browser on port ${port} closed.`);
}
