/**
 * Preloaded via NODE_OPTIONS --require.
 * Intercepts:
 * 1. require('workerMain') → patches with bridge/Node routing
 * 2. chromium.launch → patches browser.newContext for context reuse
 *
 * Context reuse: Node-mode tests reuse one shared context/page per worker
 * instead of creating fresh ones per test (~575ms saving per test).
 *
 * When PW_REUSE_CDP is set (BrowserManager running), chromium.launch is
 * replaced with chromium.connectOverCDP so tests reuse BrowserManager's
 * headed browser instead of launching a new one.
 */

import Module = require('module');
import path = require('path');

let sharedContext: any = null;
let sharedPage: any = null;
let defaultViewport: { width: number; height: number } | null = null;
let browserPatched = false;

const origLoad = (Module as any)._load;

(Module as any)._load = function (request: string, parent: unknown) {
  if (typeof request === 'string' && request.includes('workerMain')) {
    const realModule = origLoad.call(this, request, parent);
    const origCreate = realModule.create;

    return {
      create(params: unknown) {
        const worker = origCreate(params);
        const bridge = require(path.resolve(__dirname, 'pw-worker.cjs'));
        bridge.patchWorker(worker, params);
        return worker;
      },
    };
  }

  const result = origLoad.apply(this, arguments);

  // Patch chromium.launch to reuse context across tests in the same worker
  if (!browserPatched && typeof result === 'object' && result !== null &&
      result.chromium && result.chromium.launch && !result.chromium.launch._pwReusePatched) {
    browserPatched = true;
    result.chromium.launch._pwReusePatched = true;
    const origLaunch = result.chromium.launch;

    result.chromium.launch = async function () {
      const cdpEndpoint = process.env.PW_REUSE_CDP;

      // When BrowserManager is running, connect to its browser via CDP
      if (cdpEndpoint && result.chromium.connectOverCDP) {

        const browser = await result.chromium.connectOverCDP(cdpEndpoint);

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
            await sharedPage.goto('about:blank', { waitUntil: 'commit' });
          } catch {}
        }
        sharedContext.newPage = async () => sharedPage;
        sharedContext.close = async () => {};
        return sharedContext;
      };

      return browser;
    };
  }

  return result;
};
