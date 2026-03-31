/**
 * Preload script injected via NODE_OPTIONS --require.
 *
 * Patches chromium.connect() to use connectOverCDP() when the wsEndpoint
 * is a CDP URL (contains /devtools/browser/). This allows the test runner
 * to reuse the existing browser with extensions loaded via --load-extension.
 *
 * Safe no-op when connect() is called with a normal Playwright wsEndpoint.
 */

import path = require('path');

// Patch after modules are loaded — no Module._load hooks needed.
// The test server loads @playwright/test synchronously, then waits for
// WebSocket commands. connect() is only called during runTests (async),
// so setImmediate fires before any connect() call.
setImmediate(() => {
  let pw: any;
  try {
    const { createRequire } = require('module');
    const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
    pw = projectRequire('@playwright/test');
  } catch {
    try {
      pw = require('@playwright/test');
    } catch {
      return;
    }
  }

  if (!pw?.chromium?.connect || pw.chromium.__pwReplPatched)
    return;

  const origConnect = pw.chromium.connect.bind(pw.chromium);

  pw.chromium.connect = async function(optionsOrWsEndpoint: any) {
    const wsEndpoint = typeof optionsOrWsEndpoint === 'string'
      ? optionsOrWsEndpoint
      : optionsOrWsEndpoint?.wsEndpoint;

    // Only intercept CDP URLs (from --remote-debugging-port)
    if (!wsEndpoint || !wsEndpoint.includes('/devtools/browser/'))
      return origConnect(optionsOrWsEndpoint);

    const browser = await pw.chromium.connectOverCDP(wsEndpoint);

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

  pw.chromium.__pwReplPatched = true;
});
