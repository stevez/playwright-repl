/**
 * pw-worker — bridge helper for patched WorkerMain.
 *
 * Called by pw-preload.cjs to patch the real WorkerMain's runTestGroup.
 * Per-file routing:
 *   - Bridge-compatible files → compile + send to bridge (fast path)
 *   - Node-dependent files → original runTestGroup (normal Playwright path)
 *
 * Bridge state (browser + bridge server) is lazily created and reused
 * across all bridge test groups within the same worker process.
 */

import path = require('path');
import { pathToFileURL } from 'url';
import { needsNode, compile, findResultByName, findResultByIndex, type TestResultEntry } from './bridge-utils.cjs';

// ─── Bridge state (shared across test groups in one worker) ───

let _bridge: any = null;
let _context: any = null;
let _usingExternalBridge = false;

async function ensureBridge(): Promise<void> {
  if (_bridge) return;

  // If PW_BRIDGE_PORT is set, reuse BrowserManager's bridge via HTTP proxy
  const externalPort = process.env.PW_BRIDGE_PORT;
  if (externalPort) {
    _bridge = new HttpBridgeClient(parseInt(externalPort, 10));
    _usingExternalBridge = true;
    console.error('[pw-worker] reusing external bridge on port ' + externalPort + ' (pid ' + process.pid + ')');
    return;
  }

  const coreMain = require.resolve('@playwright-repl/core');
  const { BridgeServer } = await import(pathToFileURL(coreMain).href);

  _bridge = new BridgeServer();
  await _bridge.start(0);

  const extPath = process.env.PW_EXT_PATH;
  const pw = require('@playwright/test');
  _context = await pw.chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      '--disable-extensions-except=' + extPath,
      '--load-extension=' + extPath,
      '--disable-background-timer-throttling',
    ],
  });

  let sw = _context.serviceWorkers()[0];
  if (!sw) sw = await _context.waitForEvent('serviceworker', { timeout: 10000 });
  await sw.evaluate(function (port: number) {
    (globalThis as any).chrome.storage.local.set({ bridgePort: port });
  }, _bridge.port);

  await _bridge.waitForConnection(10000);
  console.error('[pw-worker] bridge ready, port ' + _bridge.port + ' (pid ' + process.pid + ')');
}

async function closeBridge(): Promise<void> {
  // External bridge is owned by BrowserManager — don't close it
  if (_usingExternalBridge) {
    _bridge = null;
    _usingExternalBridge = false;
    return;
  }
  // Persistent context with extensions may hang on close (macOS/Windows).
  // Use a timeout to prevent blocking the worker shutdown.
  const timeout = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  if (_context) await Promise.race([_context.close(), timeout(3000)]).catch(() => {});
  if (_bridge) await Promise.race([_bridge.close(), timeout(1000)]).catch(() => {});
  _context = null;
  _bridge = null;
}

// ─── HTTP bridge client (calls BrowserManager's proxy) ───

class HttpBridgeClient {
  private _port: number;
  constructor(port: number) { this._port = port; }

  get port() { return this._port; }

  async runScript(script: string, language: string = 'javascript'): Promise<{ text?: string; isError?: boolean }> {
    return this._post('/run-script', { script, language });
  }

  async run(command: string): Promise<{ text?: string; isError?: boolean }> {
    return this._post('/run', { command });
  }

  private _post(urlPath: string, body: Record<string, unknown>): Promise<{ text?: string; isError?: boolean }> {
    const http = require('http');
    const data = JSON.stringify(body);
    return new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: this._port,
        path: urlPath,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, (res: any) => {
        let chunks = '';
        res.on('data', (c: string) => chunks += c);
        res.on('end', () => {
          try { resolve(JSON.parse(chunks)); }
          catch { resolve({ text: chunks, isError: true }); }
        });
      });
      req.on('error', (e: Error) => resolve({ text: e.message, isError: true }));
      req.write(data);
      req.end();
    });
  }
}

// ─── Test name resolution ───

async function resolveTestNames(worker: any, runPayload: any): Promise<Map<string, string> | null> {
  await worker._loadIfNeeded();

  const cacheKeys = Object.keys(require.cache);
  const testLoaderPath = cacheKeys.find((k: string) => k.includes('common') && k.endsWith('testLoader.js'));
  const suiteUtilsPath = cacheKeys.find((k: string) => k.includes('common') && k.endsWith('suiteUtils.js'));
  if (!testLoaderPath || !suiteUtilsPath) return null;

  const { loadTestFile } = require(testLoaderPath);
  const { bindFileSuiteToProject, applyRepeatEachIndex } = require(suiteUtilsPath);

  const fileSuite = await loadTestFile(runPayload.file, worker._config);
  const suite = bindFileSuiteToProject(worker._project, fileSuite);
  if (worker._params.repeatEachIndex)
    applyRepeatEachIndex(worker._project, suite, worker._params.repeatEachIndex);

  const idToTitle = new Map<string, string>();
  for (const test of suite.allTests()) {
    const fullName = test.titlePath().slice(1).join(' > ');
    idToTitle.set(test.id, fullName);
  }
  return idToTitle;
}

function buildGrep(testNames: string[]): string | null {
  if (!testNames || testNames.length === 0) return null;
  const escaped = testNames.map((n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return '^(' + escaped.join('|') + ')$';
}

// ─── Bridge execution ───

async function runOnBridge(worker: any, compiled: string, runPayload: any, idToTitle: Map<string, string> | null): Promise<void> {
  const entries = runPayload.entries;

  const requestedNames: string[] = idToTitle
    ? entries.map((e: any) => idToTitle.get(e.testId)).filter(Boolean)
    : [];
  const grepPattern = buildGrep(requestedNames);

  let script = 'globalThis.__resetTestState();\n';
  if (grepPattern) {
    script += 'globalThis.__setGrepExact(' + JSON.stringify(grepPattern) + ');\n';
  }
  script += compiled + '\n';
  script += 'await globalThis.__runTests();';

  const r = await _bridge.runScript(script, 'javascript');

  const resultText: string = r.isError ? '' : (r.text || '');
  const lines = resultText.split('\n');

  for (const entry of entries) {
    const testId: string = entry.testId;
    const testName = idToTitle ? idToTitle.get(testId) : null;

    worker.dispatchEvent('testBegin', {
      testId,
      startWallTime: Date.now(),
    });

    const testResult: TestResultEntry = testName
      ? findResultByName(lines, testName)
      : findResultByIndex(lines, entries.indexOf(entry));

    worker.dispatchEvent('testEnd', {
      testId,
      duration: testResult.duration,
      status: testResult.status,
      errors: testResult.errors,
      hasNonRetriableError: false,
      expectedStatus: 'passed',
      annotations: [],
      timeout: 30000,
    });
  }

  worker.dispatchEvent('done', {
    fatalErrors: r.isError ? [{ message: r.text }] : [],
    skipTestsDueToSetupFailure: [],
  });
  console.error('[pw-worker] bridge done (pid ' + process.pid + ')');
}

// ─── Patch real WorkerMain ───

function patchWorker(worker: any, _params: unknown): void {
  const origRunTestGroup = worker.runTestGroup.bind(worker);
  const origGracefullyClose = worker.gracefullyClose.bind(worker);

  worker.runTestGroup = async function (runPayload: any) {
    if (needsNode(runPayload.file)) {
      console.error('[pw-worker] node mode: ' + runPayload.file);
      return origRunTestGroup(runPayload);
    }

    const idToTitle = await resolveTestNames(worker, runPayload);
    const names: string[] = idToTitle
      ? runPayload.entries.map((e: any) => idToTitle.get(e.testId)).filter(Boolean)
      : [];
    console.error('[pw-worker] bridge mode: ' + runPayload.file +
      (names.length ? ' (' + names.join(', ') + ')' : ''));

    const compiled = await compile(runPayload.file);
    await ensureBridge();
    return runOnBridge(worker, compiled, runPayload, idToTitle);
  };

  worker.gracefullyClose = async function () {
    await closeBridge();
    return origGracefullyClose();
  };
}

module.exports = { patchWorker };
