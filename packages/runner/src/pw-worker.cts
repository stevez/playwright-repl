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

import fs = require('fs');
import path = require('path');
import { pathToFileURL } from 'url';

// ─── Node API detection ───

const NODE_API_PATTERNS: RegExp[] = [
  // Node built-in modules
  /\brequire\s*\(\s*['"]fs['"]\)/,
  /\brequire\s*\(\s*['"]path['"]\)/,
  /\brequire\s*\(\s*['"]child_process['"]\)/,
  /\brequire\s*\(\s*['"]os['"]\)/,
  /\brequire\s*\(\s*['"]net['"]\)/,
  /\brequire\s*\(\s*['"]http['"]\)/,
  /\brequire\s*\(\s*['"]https['"]\)/,
  /\brequire\s*\(\s*['"]crypto['"]\)/,
  /\bfrom\s+['"]fs['"]/,
  /\bfrom\s+['"]path['"]/,
  /\bfrom\s+['"]child_process['"]/,
  /\bfrom\s+['"]node:/,
  // Node globals
  /\bprocess\.env\b/,
  /\bprocess\.cwd\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bBuffer\.\b/,
  // Playwright APIs that need Node (callbacks, non-serializable)
  /\.route\s*\(/,
  /\.unroute\s*\(/,
  /\.routeFromHAR\s*\(/,
  /\.waitForEvent\s*\(/,
  /\.waitForResponse\s*\(/,
  /\.waitForRequest\s*\(/,
  /\.\$eval\s*\(/,
  /\.\$\$eval\s*\(/,
];

function needsNode(filePath: string): boolean {
  const checked = new Set<string>();

  function check(file: string): boolean {
    if (checked.has(file)) return false;
    checked.add(file);

    let source: string;
    try { source = fs.readFileSync(file, 'utf-8'); }
    catch { return false; }

    for (const pattern of NODE_API_PATTERNS) {
      if (pattern.test(source)) return true;
    }

    const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(source)) !== null) {
      const dir = path.dirname(file);
      const candidates = [
        path.resolve(dir, m[1]),
        path.resolve(dir, m[1] + '.ts'),
        path.resolve(dir, m[1] + '.js'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c) && check(c)) return true;
      }
    }
    return false;
  }

  return check(filePath);
}

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

interface TestResultEntry { status: string; duration: number; errors: { message: string }[]; }

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

function findResultByName(lines: string[], testName: string): TestResultEntry {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const passMatch = line.match(/^\s*[✓✔]\s+(.+?)\s+\(\d+ms\)$/);
    if (passMatch && passMatch[1] === testName) {
      const dur = line.match(/\((\d+)ms\)/);
      return { status: 'passed', duration: dur ? parseInt(dur[1]) : 0, errors: [] };
    }
    const failMatch = line.match(/^\s*[✗✘]\s+(.+?)\s+\(\d+ms\)$/);
    if (failMatch && failMatch[1] === testName) {
      const dur = line.match(/\((\d+)ms\)/);
      const errLine = lines[i + 1] || '';
      return { status: 'failed', duration: dur ? parseInt(dur[1]) : 0, errors: [{ message: errLine.trim() }] };
    }
    const skipMatch = line.match(/^\s*-\s+(.+?)\s+\(skipped\)$/);
    if (skipMatch && skipMatch[1] === testName) {
      return { status: 'skipped', duration: 0, errors: [] };
    }
  }
  return { status: 'failed', duration: 0, errors: [{ message: 'Test result not found' }] };
}

function findResultByIndex(lines: string[], idx: number): TestResultEntry {
  let currentIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^\s*[✓✔]/)) {
      currentIdx++;
      if (currentIdx === idx) {
        const dur = line.match(/\((\d+)ms\)/);
        return { status: 'passed', duration: dur ? parseInt(dur[1]) : 0, errors: [] };
      }
    } else if (line.match(/^\s*[✗✘]/)) {
      currentIdx++;
      if (currentIdx === idx) {
        const dur = line.match(/\((\d+)ms\)/);
        const errLine = lines[i + 1] || '';
        return { status: 'failed', duration: dur ? parseInt(dur[1]) : 0, errors: [{ message: errLine.trim() }] };
      }
    } else if (line.match(/^\s*-.*\(skipped\)/)) {
      currentIdx++;
      if (currentIdx === idx) {
        return { status: 'skipped', duration: 0, errors: [] };
      }
    }
  }
  return { status: 'failed', duration: 0, errors: [{ message: 'Test result not found' }] };
}

// ─── Compile ───

async function compile(testFilePath: string): Promise<string> {
  const esbuild = require('esbuild');

  const testDir = path.dirname(testFilePath);
  const testFileName = path.basename(testFilePath);

  const shimPath = path.resolve(__dirname, 'shim', 'alias.ts');
  const shimPathJs = shimPath.replace('.ts', '.js');
  const aliasPath = fs.existsSync(shimPath) ? shimPath : shimPathJs;

  const plugin = {
    name: 'pw-bridge',
    setup(build: any) {
      build.onResolve({ filter: /^__entry__$/ }, () => ({ path: '__entry__', namespace: 'entry' }));
      build.onLoad({ filter: /.*/, namespace: 'entry' }, () => ({
        contents: 'import "./' + testFileName + '";',
        resolveDir: testDir,
        loader: 'ts',
      }));
    },
  };

  const result = await esbuild.build({
    entryPoints: ['__entry__'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'neutral',
    plugins: [plugin],
    alias: { '@playwright/test': aliasPath },
  });

  return result.outputFiles[0].text;
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
