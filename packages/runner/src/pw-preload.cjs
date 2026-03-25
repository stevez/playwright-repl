/**
 * Preloaded via NODE_OPTIONS --require.
 * Patches chromium.launch → launchPersistentContext with extension.
 * Each worker gets its own bridge on random port (supports parallel).
 * Sets bridge port via chrome.storage after launch.
 * Reuses one browser + context + page per worker.
 */
'use strict';

if (!process.env.PW_REUSE_CONTEXT) return;

const extPath = process.env.PW_EXT_PATH;
let sharedBrowser = null;
let sharedContext = null;
let sharedPage = null;

const Module = require('module');
const origLoad = Module._load;
let patched = false;

Module._load = function(request) {
  const result = origLoad.apply(this, arguments);

  if (!patched && typeof result === 'object' && result !== null &&
      result.chromium && result.chromium.launch && !result.chromium.launch._pwPatched) {
    patched = true;
    const chromium = result.chromium;
    const origLaunch = chromium.launch;
    origLaunch._pwPatched = true;

    chromium.launch = async function(options) {
      if (sharedBrowser) return sharedBrowser;

      if (extPath) {
        // Start bridge on random port (each worker gets its own)
        var coreMain = require.resolve('@playwright-repl/core');
        var coreUrl = 'file:///' + coreMain.replace(/\\/g, '/');
        var { BridgeServer } = await import(coreUrl);
        var bridge = new BridgeServer();
        await bridge.start(0);

        // Launch with extension
        var args = (options && options.args || []).concat([
          '--disable-extensions-except=' + extPath,
          '--load-extension=' + extPath,
          '--disable-background-timer-throttling',
        ]);

        var context = await chromium.launchPersistentContext('', {
          channel: 'chromium',
          headless: options ? options.headless : true,
          args: args,
        });

        // Set bridge port via service worker
        var sw = context.serviceWorkers()[0];
        if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 });
        await sw.evaluate(function(port) {
          chrome.storage.local.set({ bridgePort: port });
        }, bridge.port);

        // Wait for extension to connect
        await bridge.waitForConnection(10000);
        console.error('[pw] bridge port ' + bridge.port + ' connected (pid ' + process.pid + ')');

        sharedContext = context;
        sharedPage = context.pages()[0] || await context.newPage();

        // Return real browser with patched newContext
        var browser = context._browser;
        browser.newContext = async function() {
          context.newPage = async function() { return sharedPage; };
          context.close = async function() {};
          return context;
        };
        sharedBrowser = browser;
        return browser;
      }

      // No extension: regular launch + context reuse
      var browser = await origLaunch.apply(this, arguments);
      var origNewContext = browser.newContext.bind(browser);
      browser.newContext = async function(ctxOpts) {
        if (!sharedContext) {
          sharedContext = await origNewContext(ctxOpts);
          sharedPage = sharedContext.pages()[0] || await sharedContext.newPage();
          console.error('[pw] context reuse (pid ' + process.pid + ')');
        }
        sharedContext.newPage = async () => sharedPage;
        sharedContext.close = async () => {};
        return sharedContext;
      };
      sharedBrowser = browser;
      return browser;
    };
  }

  return result;
};
