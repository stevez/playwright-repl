/**
 * Preload script injected via NODE_OPTIONS --require.
 *
 * Patches chromium.connect() to use connectOverCDP() when the wsEndpoint
 * is a CDP URL (contains /devtools/browser/). This allows the test runner
 * to reuse the existing browser process without version mismatch errors.
 *
 * Safe no-op when connect() is called with a normal Playwright wsEndpoint.
 */

import path = require('path');

// Patch after modules are loaded — no Module._load hooks needed.
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

    return pw.chromium.connectOverCDP(wsEndpoint);
  };

  pw.chromium.__pwReplPatched = true;
});
