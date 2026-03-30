/**
 * Preloaded via NODE_OPTIONS --require.
 *
 * Patches Playwright's chromium.launch for:
 * 1. Context reuse — shared context/page across tests in a worker
 * 2. CDP reuse — connectOverCDP when PW_REUSE_CDP is set
 *
 * Also patches workerMain to route bridge-eligible tests to the bridge.
 *
 * Uses process 'loaded' event to patch AFTER all modules are initialized,
 * avoiding Module._load hooks that interfere with Playwright's test file
 * loading context (which causes "two different versions" errors).
 */

import Module = require('module');
import path = require('path');

let sharedContext: any = null;
let sharedPage: any = null;
let defaultViewport: { width: number; height: number } | null = null;

// ─── workerMain interception (must use Module._load for this) ────────────────
// Only intercept 'workerMain', pass everything else through immediately.
const origLoad = (Module as any)._load;
let workerPatched = false;

(Module as any)._load = function (request: string, parent: unknown) {
  // Only intercept workerMain — everything else passes through untouched
  if (!workerPatched && typeof request === 'string' && request.includes('workerMain')) {
    workerPatched = true;
    // Remove hook BEFORE loading workerMain so test file loading
    // goes through the original Module._load (no foreign stack frames)
    (Module as any)._load = origLoad;

    const realModule = origLoad.call(this, request, parent);
    const origCreate = realModule.create;

    return {
      create(params: unknown) {
        const worker = origCreate(params);
        const bridge = origLoad.call(this, path.resolve(__dirname, 'pw-worker.cjs'), module);
        bridge.patchWorker(worker, params);
        return worker;
      },
    };
  }

  // Pass through — hook is still active but only until workerMain is found
  return origLoad.apply(this, arguments);
};

// ─── chromium.launch patching (deferred, no Module._load) ────────────────────
// Use setImmediate to patch after all --require scripts and the main module
// have loaded. By this time, @playwright/test is in the module cache.
setImmediate(() => {
  let pw: any;
  try {
    // Resolve from user's project to avoid duplicate module instances
    const { createRequire } = require('module');
    const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
    pw = projectRequire('@playwright/test');
  } catch {
    try {
      pw = require('@playwright/test');
    } catch {
      return; // @playwright/test not available, nothing to patch
    }
  }

  if (!pw?.chromium?.launch || pw.chromium.launch._pwReusePatched)
    return;

  pw.chromium.launch._pwReusePatched = true;
  const origLaunch = pw.chromium.launch;

  pw.chromium.launch = async function () {
    const cdpEndpoint = process.env.PW_REUSE_CDP;

    // When BrowserManager is running, connect to its browser via CDP
    if (cdpEndpoint && pw.chromium.connectOverCDP) {
      let browser;
      try {
        browser = await pw.chromium.connectOverCDP(cdpEndpoint);
      } catch {
        // Browser not running — fall back to normal launch
        return origLaunch.apply(this, arguments);
      }

      // Reuse existing context from BrowserManager
      const origNewContext = browser.newContext.bind(browser);
      browser.newContext = async function (contextOptions: any) {
        if (!sharedContext) {
          const contexts = browser.contexts();
          if (contexts.length > 0) {
            sharedContext = contexts[0];
            sharedPage = sharedContext.pages()[0] || await sharedContext.newPage();
          } else {
            sharedContext = await origNewContext(contextOptions);
            sharedPage = sharedContext.pages()[0] || await sharedContext.newPage();
          }
          defaultViewport = sharedPage.viewportSize();
        } else {
          try {
            await sharedContext.clearCookies();
            await sharedContext.clearPermissions().catch(() => {});
            await sharedContext.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
            await sharedPage.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
            if (defaultViewport) await sharedPage.setViewportSize(defaultViewport);
            await sharedPage.evaluate(() => {
              try { localStorage.clear(); } catch {}
              try { sessionStorage.clear(); } catch {}
            }).catch(() => {});
            await sharedPage.goto('about:blank', { waitUntil: 'commit' });
          } catch {}
        }
        sharedContext.newPage = async () => sharedPage;
        sharedContext.close = async () => {};
        return sharedContext;
      };

      // Don't close BrowserManager's browser
      browser.close = async () => {};
      return browser;
    }

    // Normal path: launch new browser, reuse context across tests
    const browser = await origLaunch.apply(this, arguments);
    const origNewContext = browser.newContext.bind(browser);

    browser.newContext = async function (contextOptions: any) {
      if (!sharedContext) {
        sharedContext = await origNewContext(contextOptions);
        sharedPage = sharedContext.pages()[0] || await sharedContext.newPage();
        defaultViewport = sharedPage.viewportSize();
      } else {
        try {
          await sharedContext.clearCookies();
          await sharedContext.clearPermissions().catch(() => {});
          await sharedContext.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
          await sharedPage.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
          if (defaultViewport) await sharedPage.setViewportSize(defaultViewport);
          await sharedPage.evaluate(() => {
            try { localStorage.clear(); } catch {}
            try { sessionStorage.clear(); } catch {}
          }).catch(() => {});
          await sharedPage.goto('about:blank', { waitUntil: 'commit' });
        } catch {}
      }
      sharedContext.newPage = async () => sharedPage;
      sharedContext.close = async () => {};
      return sharedContext;
    };

    return browser;
  };
});
