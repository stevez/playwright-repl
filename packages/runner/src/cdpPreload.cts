/**
 * Preload script injected via NODE_OPTIONS --require.
 *
 * Patches chromium.connect() to use connectOverCDP() when the wsEndpoint
 * is a CDP URL (contains /devtools/browser/). This allows the test runner
 * to reuse the existing browser process without version mismatch errors.
 *
 * Safe no-op when connect() is called with a normal Playwright wsEndpoint.
 */

import Module = require('module');

const origLoad = (Module as any)._load;
let patched = false;

(Module as any)._load = function (request: string, parent: unknown) {
  const mod = origLoad.apply(this, arguments);

  // Intercept playwright-core or @playwright/test to patch chromium.connect
  if (!patched && (request === 'playwright-core' || request === '@playwright/test') && mod?.chromium?.connect && !mod.chromium.__pwReplPatched) {
    patched = true;
    (Module as any)._load = origLoad; // remove hook immediately

    const origConnect = mod.chromium.connect.bind(mod.chromium);

    mod.chromium.connect = async function(optionsOrWsEndpoint: any) {
      const wsEndpoint = typeof optionsOrWsEndpoint === 'string'
        ? optionsOrWsEndpoint
        : optionsOrWsEndpoint?.wsEndpoint;

      // Only intercept CDP URLs (from --remote-debugging-port)
      if (!wsEndpoint || !wsEndpoint.includes('/devtools/browser/'))
        return origConnect(optionsOrWsEndpoint);

      const browser = await mod.chromium.connectOverCDP(wsEndpoint);
      // Don't let the test runner kill our shared browser.
      // Override both public close() and internal _close() to prevent
      // the browser from being killed when the worker process exits.
      browser.close = async () => {};
      if (browser._close) browser._close = async () => {};
      if (browser.disconnect) browser.disconnect = async () => {};
      // Prevent the browser process from being killed via the connection
      const conn = browser._connection || browser._browserConnection;
      if (conn?.close) conn.close = () => {};
      return browser;
    };

    mod.chromium.__pwReplPatched = true;
  }

  return mod;
};
