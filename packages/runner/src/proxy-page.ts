/**
 * Proxy Page
 *
 * Creates a Proxy that looks like Playwright's Page object.
 * Records method calls as a string chain. Nothing executes until `await`.
 * `await` triggers `then()` which sends the chain to the bridge.
 *
 * Rules:
 *   page.* → Proxy (builds chain string)
 *   await page.* → bridge.run(chain) → executes in browser
 *   expect(proxy) → builds expect chain → bridge.run on await
 *   expect(value) → native assertion in Node.js
 */

type BridgeRun = (command: string) => Promise<{ text?: string; isError?: boolean }>;
const BRIDGE_TIMEOUT = 30000;
const BRIDGE_DEBUG = !!process.env.PW_DEBUG;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: any;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

const PROXY_FLAG = Symbol('isProxy');
const CHAIN_KEY = Symbol('chain');

// Methods delegated to Node.js context (context-level routing).
const CONTEXT_METHODS = new Set([
  'route', 'unroute', 'routeFromHAR', 'unrouteAll',
]);

// Methods delegated to Node page (same tab, returns non-serializable objects or needs concurrency).
const CDP_PAGE_METHODS = new Set([
  'waitForEvent',
  '$', '$$', '$eval', '$$eval',
  'frames', 'mainFrame',
  'evaluate',            // needs concurrency with pending bridge actions
  'evaluateHandle',      // returns JSHandle — non-serializable
  'on', 'off', 'once',  // event listeners need real page
]);

function makeProxy(chain: string, bridge: BridgeRun, nodePage?: any, cdpPage?: any): any {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      // Internal: check if this is a proxy
      if (prop === PROXY_FLAG) return true;
      if (prop === CHAIN_KEY) return chain;

      // await triggers execution
      if (prop === 'then') {
        return (resolve: (v: any) => void, reject: (e: any) => void) => {
          const cmd = `await ${chain}`;
          if (BRIDGE_DEBUG) console.log(`    [bridge →] ${cmd.substring(0, 120)}`);
          withTimeout(bridge(cmd), BRIDGE_TIMEOUT, chain).then(r => {
            if (BRIDGE_DEBUG) console.log(`    [bridge ←] ${r.isError ? 'ERR' : 'OK'} ${(r.text || '').substring(0, 80)}`);
            if (r.isError) reject(new Error(r.text || 'Bridge error'));
            else {
              const text = r.text;
              if (text === undefined || text === '') resolve(undefined);
              else {
                try { resolve(JSON.parse(text)); }
                catch { resolve(text); }
              }
            }
          }).catch(reject);
        };
      }

      // Symbol.toPrimitive — for string concatenation etc.
      if (prop === Symbol.toPrimitive) {
        return () => chain;
      }

      // Context methods — delegate to Node.js context (route/unroute).
      if (nodePage && chain === 'page' && CONTEXT_METHODS.has(String(prop))) {
        return (...args: any[]) => nodePage[String(prop)](...args);
      }

      // CDP page methods — delegate to real page via CDP (waitForEvent).
      if (cdpPage && chain === 'page' && CDP_PAGE_METHODS.has(String(prop))) {
        return (...args: any[]) => cdpPage[String(prop)](...args);
      }

      // Property access → extend chain (returns callable proxy)
      return makeCallableProxy(`${chain}.${String(prop)}`, bridge, nodePage, cdpPage);
    },
  };

  return new Proxy({}, handler);
}

function makeCallableProxy(chain: string, bridge: BridgeRun, nodePage?: any, cdpPage?: any): any {
  // A proxy that can be both called as a function AND have properties accessed
  const fn = function() {};
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === PROXY_FLAG) return true;
      if (prop === CHAIN_KEY) return chain;

      if (prop === 'then') {
        return (resolve: (v: any) => void, reject: (e: any) => void) => {
          withTimeout(bridge(`await ${chain}`), BRIDGE_TIMEOUT, chain).then(r => {
            if (r.isError) reject(new Error(r.text || 'Bridge error'));
            else {
              const text = r.text;
              if (text === undefined || text === '') resolve(undefined);
              else {
                try { resolve(JSON.parse(text)); }
                catch { resolve(text); }
              }
            }
          }).catch(reject);
        };
      }

      if (prop === Symbol.toPrimitive) {
        return () => chain;
      }

      return makeCallableProxy(`${chain}.${String(prop)}`, bridge, nodePage, cdpPage);
    },

    apply(_target, _thisArg, args) {
      const argsStr = args.map(serializeArg).join(', ');
      return makeProxy(`${chain}(${argsStr})`, bridge, nodePage, cdpPage);
    },
  });
}

function serializeArg(arg: unknown): string {
  // Proxy argument → use its chain
  if (arg && typeof arg === 'object' && (arg as any)[PROXY_FLAG]) {
    return (arg as any)[CHAIN_KEY];
  }
  // RegExp → serialize as regex literal
  if (arg instanceof RegExp) {
    return arg.toString();
  }
  // Function → serialize as string
  if (typeof arg === 'function') {
    return arg.toString();
  }
  // Everything else → JSON
  return JSON.stringify(arg);
}

/**
 * Create a proxy page that routes most calls through the bridge.
 * Methods in NODE_PAGE_METHODS delegate to the real Node page (CDP) instead.
 */
export function createPageProxy(bridge: BridgeRun, nodePage?: any, cdpPage?: any): any {
  return makeProxy('page', bridge, nodePage, cdpPage);
}

/**
 * Create a smart expect function.
 * - expect(proxy) → bridge (async Playwright assertions)
 * - expect(value) → native Node.js assertion
 */
export function createExpect(bridge: BridgeRun) {
  // Simple native expect for non-proxy values
  const nativeExpect = (actual: any) => ({
    toBe: (expected: any) => { if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`); },
    toEqual: (expected: any) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`); },
    toBeTruthy: () => { if (!actual) throw new Error(`Expected truthy but got ${JSON.stringify(actual)}`); },
    toBeFalsy: () => { if (actual) throw new Error(`Expected falsy but got ${JSON.stringify(actual)}`); },
    toContain: (expected: any) => { if (!String(actual).includes(expected)) throw new Error(`Expected to contain ${JSON.stringify(expected)}`); },
    toMatch: (pattern: RegExp) => { if (!pattern.test(String(actual))) throw new Error(`Expected to match ${pattern}`); },
    not: {
      toBe: (expected: any) => { if (actual === expected) throw new Error(`Expected not ${JSON.stringify(expected)}`); },
      toContain: (expected: any) => { if (String(actual).includes(expected)) throw new Error(`Expected not to contain ${JSON.stringify(expected)}`); },
    },
  });

  return (target: any) => {
    if (target && target[PROXY_FLAG]) {
      // Proxy → route to bridge
      return makeCallableProxy(`expect(${target[CHAIN_KEY]})`, bridge);
    }
    // Regular value → native assertion
    return nativeExpect(target);
  };
}

export { PROXY_FLAG, CHAIN_KEY };
