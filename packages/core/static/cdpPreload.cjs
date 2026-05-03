"use strict";
/**
 * Preload script injected via NODE_OPTIONS --require.
 *
 * Patches chromium.connect() to use connectOverCDP() when the wsEndpoint
 * is a CDP URL (contains /devtools/browser/). This allows the test runner
 * to reuse the existing browser process without version mismatch errors.
 *
 * Safe no-op when connect() is called with a normal Playwright wsEndpoint.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const Module = require("module");
const origLoad = Module._load;
let patched = false;
Module._load = function (request, parent) {
    const mod = origLoad.apply(this, arguments);
    // Intercept playwright-core or @playwright/test to patch chromium.connect
    if (!patched && (request === 'playwright-core' || request === '@playwright/test') && mod?.chromium?.connect && !mod.chromium.__pwReplPatched) {
        patched = true;
        Module._load = origLoad; // remove hook immediately
        const origConnect = mod.chromium.connect.bind(mod.chromium);
        mod.chromium.connect = async function (optionsOrWsEndpoint) {
            const wsEndpoint = typeof optionsOrWsEndpoint === 'string'
                ? optionsOrWsEndpoint
                : optionsOrWsEndpoint?.wsEndpoint;
            // Only intercept CDP URLs (from --remote-debugging-port)
            if (!wsEndpoint || !wsEndpoint.includes('/devtools/browser/'))
                return origConnect(optionsOrWsEndpoint);
            const browser = await mod.chromium.connectOverCDP(wsEndpoint);
            // Reuse the persistent context so tests run in the same window
            browser._newContextForReuse = async function () {
                const contexts = browser.contexts();
                return contexts[0] || await browser.newContext();
            };
            browser._disconnectFromReusedContext = async function () { };
            // Don't let the test runner kill our shared browser
            browser.close = async () => { };
            return browser;
        };
        mod.chromium.__pwReplPatched = true;
    }
    return mod;
};
//# sourceMappingURL=cdpPreload.cjs.map