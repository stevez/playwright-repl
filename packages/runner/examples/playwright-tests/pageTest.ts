/**
 * pageTest — fixture wrapper for Playwright's page tests.
 *
 * Provides a `server` fixture backed by a static HTTP server
 * serving ./assets/. Uses globalThis to pass the server to tests
 * (avoids test.extend fixture lifecycle issues in our shim).
 */

import { test as base, expect } from '@playwright/test';
import http from 'http';
import path from 'path';
import fs from 'fs';
// Resolve assets dir — try CWD/assets first, then look for playwright-tests/assets
let ASSETS_DIR = path.resolve(process.cwd(), 'assets');
if (!fs.existsSync(ASSETS_DIR)) {
  ASSETS_DIR = path.resolve(process.cwd(), 'playwright-tests/assets');
}
if (!fs.existsSync(ASSETS_DIR)) {
  // Search up from CWD for a playwright-tests/assets directory
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'playwright-tests', 'assets');
    if (fs.existsSync(candidate)) { ASSETS_DIR = candidate; break; }
    const candidate2 = path.join(dir, 'examples', 'playwright-tests', 'assets');
    if (fs.existsSync(candidate2)) { ASSETS_DIR = candidate2; break; }
    dir = path.dirname(dir);
  }
}


interface Server {
  PREFIX: string;
  CROSS_PROCESS_PREFIX: string;
  EMPTY_PAGE: string;
  port: number;
}


// Start server once, globally
let _server: Server | null = null;
let _httpServer: http.Server | null = null;

async function ensureServer(): Promise<Server> {
  if (_server) return _server;
  return new Promise((resolve) => {
    _httpServer = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);
      const filePath = path.join(ASSETS_DIR, decodeURIComponent(url.pathname));
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html', '.js': 'application/javascript',
        '.css': 'text/css', '.json': 'application/json',
        '.png': 'image/png', '.svg': 'image/svg+xml',
      };
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(data);
      });
    });
    _httpServer.listen(0, '127.0.0.1', () => {
      const port = (_httpServer!.address() as any).port;
      _server = {
        PREFIX: `http://127.0.0.1:${port}`,
        CROSS_PROCESS_PREFIX: `http://127.0.0.1:${port}`,
        EMPTY_PAGE: `http://127.0.0.1:${port}/empty.html`,
        port,
      };
      console.log(`    [server] started on port ${port}, assets: ${ASSETS_DIR}`);
      (globalThis as any).__emptyPage = _server.EMPTY_PAGE;
      resolve(_server);
    });
  });
}

// Extend test with server + platform fixtures
const test = base.extend<{
  server: Server;
  browserName: string;
  headless: boolean;
  isAndroid: boolean;
  isLinux: boolean;
  isWindows: boolean;
  isMac: boolean;
  isFrozenWebkit: boolean;
  isElectron: boolean;
  mode: string;
}>({
  server: async ({}, use) => {
    const srv = await ensureServer();
    await use(srv);
  },
  browserName: async ({}, use) => { await use('chromium'); },
  headless: async ({}, use) => { await use(true); },
  isAndroid: async ({}, use) => { await use(false); },
  isLinux: async ({}, use) => { await use(process.platform === 'linux'); },
  isWindows: async ({}, use) => { await use(process.platform === 'win32'); },
  isMac: async ({}, use) => { await use(process.platform === 'darwin'); },
  isFrozenWebkit: async ({}, use) => { await use(false); },
  isElectron: async ({}, use) => { await use(false); },
  mode: async ({}, use) => { await use('default'); },
});


function rafraf(page: any, count = 1): Promise<void> {
  return page.evaluate((c: number) => {
    return new Promise<void>(resolve => {
      function step() {
        if (--c <= 0) resolve();
        else requestAnimationFrame(() => requestAnimationFrame(step));
      }
      requestAnimationFrame(() => requestAnimationFrame(step));
    });
  }, count);
}

export { test, test as it, expect, rafraf };
