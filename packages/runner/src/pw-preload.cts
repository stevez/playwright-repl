/**
 * Preloaded via NODE_OPTIONS --require.
 * Intercepts:
 * 1. require('workerMain') → patches with bridge/Node routing
 * 2. chromium.launch → patches browser.newContext for context reuse
 *
 * Context reuse: Node-mode tests reuse one shared context/page per worker
 * instead of creating fresh ones per test (~575ms saving per test).
 */

import Module = require('module');
import path = require('path');

let sharedContext: any = null;
let sharedPage: any = null;
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
      const browser = await origLaunch.apply(this, arguments);
      const origNewContext = browser.newContext.bind(browser);

      browser.newContext = async function (contextOptions: any) {
        if (!sharedContext) {
          sharedContext = await origNewContext(contextOptions);
          sharedPage = sharedContext.pages()[0] || await sharedContext.newPage();
        } else {
          // Reuse: reset page state + viewport to Playwright default (1280×720)
          try {
            await sharedContext.clearCookies();
            await sharedContext.clearPermissions().catch(() => {});
            await sharedPage.setViewportSize({ width: 1280, height: 720 });
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
