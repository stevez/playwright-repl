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
'use strict';

// ─── Node API detection ───

const NODE_API_PATTERNS = [
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

function needsNode(filePath) {
  const fs = require('fs');
  const path = require('path');
  const checked = new Set();

  function check(file) {
    if (checked.has(file)) return false;
    checked.add(file);

    let source;
    try { source = fs.readFileSync(file, 'utf-8'); }
    catch { return false; }

    for (const pattern of NODE_API_PATTERNS) {
      if (pattern.test(source)) return true;
    }

    // Check local imports (./foo, ../foo)
    const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    let m;
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

let _bridge = null;
let _context = null;

async function ensureBridge() {
  if (_bridge) return;

  const { pathToFileURL } = require('url');
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
  await sw.evaluate(function(port) {
    chrome.storage.local.set({ bridgePort: port });
  }, _bridge.port);

  await _bridge.waitForConnection(10000);
  console.error('[pw-worker] bridge ready, port ' + _bridge.port + ' (pid ' + process.pid + ')');
}

async function closeBridge() {
  if (_context) await _context.close().catch(() => {});
  if (_bridge) await _bridge.close().catch(() => {});
  _context = null;
  _bridge = null;
}

// ─── Test name resolution ───

async function resolveTestNames(worker, runPayload) {
  await worker._loadIfNeeded();

  const cacheKeys = Object.keys(require.cache);
  const testLoaderPath = cacheKeys.find(k => k.includes('common') && k.endsWith('testLoader.js'));
  const suiteUtilsPath = cacheKeys.find(k => k.includes('common') && k.endsWith('suiteUtils.js'));
  if (!testLoaderPath || !suiteUtilsPath) return null;

  const { loadTestFile } = require(testLoaderPath);
  const { bindFileSuiteToProject, applyRepeatEachIndex } = require(suiteUtilsPath);

  const fileSuite = await loadTestFile(runPayload.file, worker._config);
  const suite = bindFileSuiteToProject(worker._project, fileSuite);
  if (worker._params.repeatEachIndex)
    applyRepeatEachIndex(worker._project, suite, worker._params.repeatEachIndex);

  const idToTitle = new Map();
  for (const test of suite.allTests()) {
    const fullName = test.titlePath().slice(1).join(' > ');
    idToTitle.set(test.id, fullName);
  }
  return idToTitle;
}

function buildGrep(testNames) {
  if (!testNames || testNames.length === 0) return null;
  const escaped = testNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return '^(' + escaped.join('|') + ')$';
}

// ─── Bridge execution ───

async function runOnBridge(worker, compiled, runPayload, idToTitle) {
  const entries = runPayload.entries;

  // Build grep to run only requested tests
  const requestedNames = idToTitle
    ? entries.map(e => idToTitle.get(e.testId)).filter(Boolean)
    : [];
  const grepPattern = buildGrep(requestedNames);

  let script = 'globalThis.__resetTestState();\n';
  if (grepPattern) {
    script += 'globalThis.__setGrepExact(' + JSON.stringify(grepPattern) + ');\n';
  }
  script += compiled + '\n';
  script += 'await globalThis.__runTests();';

  const r = await _bridge.runScript(script, 'javascript');

  const resultText = r.isError ? '' : (r.text || '');
  const lines = resultText.split('\n');

  for (const entry of entries) {
    const testId = entry.testId;
    const testName = idToTitle ? idToTitle.get(testId) : null;

    worker.dispatchEvent('testBegin', {
      testId: testId,
      startWallTime: Date.now(),
    });

    const testResult = testName
      ? findResultByName(lines, testName)
      : findResultByIndex(lines, entries.indexOf(entry));

    worker.dispatchEvent('testEnd', {
      testId: testId,
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

function findResultByName(lines, testName) {
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

function findResultByIndex(lines, idx) {
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

async function compile(testFilePath) {
  const esbuild = require('esbuild');
  const path = require('path');
  const fs = require('fs');

  const testDir = path.dirname(testFilePath);
  const testFileName = path.basename(testFilePath);

  const shimPath = path.resolve(__dirname, 'shim', 'alias.ts');
  const shimPathJs = shimPath.replace('.ts', '.js');
  const aliasPath = fs.existsSync(shimPath) ? shimPath : shimPathJs;

  const plugin = {
    name: 'pw-bridge',
    setup(build) {
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

function patchWorker(worker, params) {
  const origRunTestGroup = worker.runTestGroup.bind(worker);
  const origGracefullyClose = worker.gracefullyClose.bind(worker);

  worker.runTestGroup = async function(runPayload) {
    if (needsNode(runPayload.file)) {
      console.error('[pw-worker] node mode: ' + runPayload.file);
      return origRunTestGroup(runPayload);
    }

    const idToTitle = await resolveTestNames(worker, runPayload);
    const names = idToTitle
      ? runPayload.entries.map(e => idToTitle.get(e.testId)).filter(Boolean)
      : [];
    console.error('[pw-worker] bridge mode: ' + runPayload.file +
      (names.length ? ' (' + names.join(', ') + ')' : ''));

    const compiled = await compile(runPayload.file);
    await ensureBridge();
    return runOnBridge(worker, compiled, runPayload, idToTitle);
  };

  worker.gracefullyClose = async function() {
    await closeBridge();
    return origGracefullyClose();
  };
}

module.exports = { patchWorker };
