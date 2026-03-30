/**
 * Preload script injected via NODE_OPTIONS --require.
 *
 * Patches chromium.connect() to use connectOverCDP() when the wsEndpoint
 * is a CDP URL (contains /devtools/browser/). This allows the test runner
 * to reuse the existing browser with extensions loaded via --load-extension.
 *
 * Safe no-op when connect() is called with a normal Playwright wsEndpoint.
 */
'use strict';

const Module = require('module');
const origLoad = Module._load;
let patched = false;

Module._load = function(request, parent, isMain) {
  const mod = origLoad.apply(this, arguments);
  if (!patched && request === 'playwright-core') {
    if (mod.chromium && !mod.chromium.__pwReplPatched) {
      patchBrowserType(mod.chromium);
      patched = true;
      Module._load = origLoad; // remove hook after patching
    }
  }
  return mod;
};

function patchBrowserType(browserType) {
  const origConnect = browserType.connect.bind(browserType);

  browserType.connect = async function(optionsOrWsEndpoint) {
    const wsEndpoint = typeof optionsOrWsEndpoint === 'string'
      ? optionsOrWsEndpoint
      : optionsOrWsEndpoint?.wsEndpoint;

    // Only intercept CDP URLs (from --remote-debugging-port)
    if (!wsEndpoint || !wsEndpoint.includes('/devtools/browser/'))
      return origConnect(optionsOrWsEndpoint);

    const browser = await browserType.connectOverCDP(wsEndpoint);

    // Return the persistent context (which has extensions loaded)
    // instead of creating a new isolated context.
    browser._newContextForReuse = async function() {
      const contexts = browser.contexts();
      return contexts[0] || await browser.newContext();
    };

    // No-op: don't disconnect from the persistent context after each test
    browser._disconnectFromReusedContext = async function() {};

    return browser;
  };

  browserType.__pwReplPatched = true;
}
