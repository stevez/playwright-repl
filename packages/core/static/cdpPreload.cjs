"use strict";
/**
 * Preload script injected via NODE_OPTIONS --require.
 *
 * Patches chromium.launch() to use connectOverCDP() when PW_REUSE_CDP is set.
 * This allows the test runner to reuse BrowserManager's Chrome instance
 * with shared context/page for fast test execution.
 *
 * Also patches chromium.connect() for CDP URLs (fallback path).
 */
Object.defineProperty(exports, "__esModule", { value: true });
const Module = require("module");
const origLoad = Module._load;
let patched = false;
let sharedContext = null;
let sharedPage = null;
let defaultViewport = null;
Module._load = function (request, parent) {
    const mod = origLoad.apply(this, arguments);
    if (!patched && (request === 'playwright-core' || request === '@playwright/test') && mod?.chromium?.launch && !mod.chromium.__pwReplPatched) {
        patched = true;
        Module._load = origLoad; // remove hook immediately
        mod.chromium.__pwReplPatched = true;
        // ─── Patch chromium.launch when PW_REUSE_CDP is set ───────────────
        const cdpEndpoint = process.env.PW_REUSE_CDP;
        if (cdpEndpoint) {
            const origLaunch = mod.chromium.launch.bind(mod.chromium);
            mod.chromium.launch = async function () {
                let browser;
                try {
                    browser = await mod.chromium.connectOverCDP(cdpEndpoint);
                } catch {
                    return origLaunch.apply(this, arguments);
                }
                const origNewContext = browser.newContext.bind(browser);
                browser.newContext = async function (contextOptions) {
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
                            await sharedPage.evaluate(() => { try { localStorage.clear(); } catch {} try { sessionStorage.clear(); } catch {} }).catch(() => {});
                            await sharedPage.evaluate(() => window.stop()).catch(() => {});
                        } catch {}
                    }
                    sharedContext.newPage = async () => sharedPage;
                    sharedContext.close = async () => {};
                    return sharedContext;
                };
                browser._newContextForReuse = async function () {
                    if (!sharedContext) {
                        const contexts = browser.contexts();
                        if (contexts.length > 0) {
                            sharedContext = contexts[0];
                            sharedPage = sharedContext.pages()[0] || await sharedContext.newPage();
                        } else {
                            sharedContext = await origNewContext({});
                            sharedPage = await sharedContext.newPage();
                        }
                        defaultViewport = sharedPage.viewportSize();
                        await sharedPage.evaluate(() => window.stop()).catch(() => {});
                    } else {
                        try {
                            await sharedContext.clearCookies();
                            await sharedContext.clearPermissions().catch(() => {});
                            await sharedContext.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
                            await sharedPage.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
                            if (defaultViewport) await sharedPage.setViewportSize(defaultViewport);
                            await sharedPage.evaluate(() => { try { localStorage.clear(); } catch {} try { sessionStorage.clear(); } catch {} }).catch(() => {});
                            await sharedPage.evaluate(() => window.stop()).catch(() => {});
                        } catch {}
                    }
                    sharedContext.newPage = async () => sharedPage;
                    sharedContext.close = async () => {};
                    return sharedContext;
                };
                browser._disconnectFromReusedContext = async function () {};
                browser.close = async () => {};
                return browser;
            };
        }
        // ─── Patch chromium.connect for CDP URLs ──────────────────────────
        const origConnect = mod.chromium.connect.bind(mod.chromium);
        mod.chromium.connect = async function (optionsOrWsEndpoint) {
            const wsEndpoint = typeof optionsOrWsEndpoint === 'string'
                ? optionsOrWsEndpoint
                : optionsOrWsEndpoint?.wsEndpoint;
            if (!wsEndpoint || !wsEndpoint.includes('/devtools/browser/'))
                return origConnect(optionsOrWsEndpoint);
            const browser = await mod.chromium.connectOverCDP(wsEndpoint);
            browser.close = async () => {};
            return browser;
        };
    }
    return mod;
};
//# sourceMappingURL=cdpPreload.cjs.map