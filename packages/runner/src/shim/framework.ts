/**
 * Test Framework Runtime
 *
 * Loaded once by execute.ts onto globalThis. Provides the test registration
 * API (test, describe, beforeEach, etc.) and the runner (__runTests).
 *
 * Test files import from '@playwright/test' which esbuild aliases to
 * ./alias.ts — a thin re-export from globalThis.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

type TestFn = (fixtures: { page: unknown; context: unknown; expect: unknown }) => Promise<void>;
type HookFn = (fixtures: { page: unknown; context: unknown; expect: unknown }) => Promise<void>;

interface TestEntry {
  name: string;
  fn: TestFn;
  only: boolean;
  skip: boolean;
}

interface Suite {
  name: string;
  tests: TestEntry[];
  beforeAll: HookFn[];
  afterAll: HookFn[];
  beforeEach: HookFn[];
  afterEach: HookFn[];
  children: Suite[];
}

interface TestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  error?: string;
  duration: number;
}

// ─── State ─────────────────────────────────────────────────────────────────

let rootSuite: Suite;
let currentSuite: Suite;
let hasOnly: boolean;

let grepPattern: RegExp | null = null;
let testTimeout = 15000; // default per-test timeout

function resetState() {
  rootSuite = {
    name: '', tests: [], beforeAll: [], afterAll: [],
    beforeEach: [], afterEach: [], children: [],
  };
  currentSuite = rootSuite;
  hasOnly = false;
}

// ─── Registration API ──────────────────────────────────────────────────────

function test(name: string, fn: TestFn) {
  currentSuite.tests.push({ name, fn, only: false, skip: false });
}

test.only = (name: string, fn: TestFn) => {
  hasOnly = true;
  currentSuite.tests.push({ name, fn, only: true, skip: false });
};

test.skip = (nameOrCond: any, fn?: any) => {
  if (typeof nameOrCond === 'string') {
    currentSuite.tests.push({ name: nameOrCond, fn, only: false, skip: true });
  } else if (nameOrCond) {
    throw new SkipError(); // conditional form inside test body
  }
};

test.describe = (name: string, fn: () => void) => {
  const suite: Suite = {
    name, tests: [], beforeAll: [], afterAll: [],
    beforeEach: [], afterEach: [], children: [],
  };
  currentSuite.children.push(suite);
  const parent = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = parent;
};
(test.describe as any).configure = () => {};

// Conditional skip: it.fixme(condition) / it.skip(condition) inside test body
class SkipError extends Error { constructor() { super('SKIP'); this.name = 'SkipError'; } }
(test as any).fixme = (condOrName?: any, fn?: any) => {
  if (typeof condOrName === 'string') return test.skip(condOrName, fn); // registration form
  if (condOrName) throw new SkipError(); // conditional form
};
(test as any).slow = () => {};
(test as any).info = () => ({ annotations: [] });

test.beforeAll = (fn: HookFn) => { currentSuite.beforeAll.push(fn); };
test.afterAll = (fn: HookFn) => { currentSuite.afterAll.push(fn); };
test.beforeEach = (fn: HookFn) => { currentSuite.beforeEach.push(fn); };
test.afterEach = (fn: HookFn) => { currentSuite.afterEach.push(fn); };

test.extend = (fixtures: Record<string, any>) => {
  const extendedTest = (name: string, fn: TestFn) => {
    currentSuite.tests.push({
      name, only: false, skip: false,
      fn: async (baseFixtures: any) => {
        const extended = { ...baseFixtures };
        for (const [key, fixtureFn] of Object.entries(fixtures)) {
          if (typeof fixtureFn === 'function') {
            await new Promise<void>((resolve, reject) => {
              const useCallback = async (value: any) => {
                extended[key] = value;
                resolve();
              };
              Promise.resolve(fixtureFn(
                { ...extended, [key]: extended[key] },
                useCallback,
              )).catch(reject);
            });
          }
        }
        await fn(extended);
      },
    });
  };
  extendedTest.only = test.only;
  extendedTest.skip = test.skip;
  extendedTest.describe = test.describe;
  extendedTest.beforeAll = test.beforeAll;
  extendedTest.afterAll = test.afterAll;
  extendedTest.beforeEach = test.beforeEach;
  extendedTest.afterEach = test.afterEach;
  extendedTest.extend = test.extend;
  extendedTest.fixme = (test as any).fixme;
  extendedTest.slow = (test as any).slow;
  extendedTest.info = (test as any).info;
  return extendedTest;
};

// ─── Smart Expect ──────────────────────────────────────────────────────────

function expect(target: unknown): unknown {
  const smartExpect = (globalThis as any).__proxyExpect;
  if (smartExpect) return smartExpect(target);
  throw new Error('expect() not available — __proxyExpect not set');
}

// ─── Runner ────────────────────────────────────────────────────────────────

async function runSuite(
  suite: Suite,
  parentBeforeEach: HookFn[],
  parentAfterEach: HookFn[],
  prefix: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const _g = globalThis as any;
  const fixtures = { page: _g.__proxyPage, context: null, expect: _g.__proxyExpect };
  const allBeforeEach = [...parentBeforeEach, ...suite.beforeEach];
  const allAfterEach = [...suite.afterEach, ...parentAfterEach];

  for (const fn of suite.beforeAll) await fn(fixtures);

  for (const t of suite.tests) {
    const fullName = prefix ? `${prefix} > ${t.name}` : t.name;

    if (t.skip || (hasOnly && !t.only) || (grepPattern && !grepPattern.test(fullName))) {
      results.push({ name: fullName, passed: true, skipped: true, duration: 0 });
      continue;
    }

    const start = Date.now();
    console.log(`    [run] ${fullName}`);
    try {
      for (const fn of allBeforeEach) await fn(fixtures);
      await Promise.race([
        t.fn(fixtures),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Test timeout of ${testTimeout}ms exceeded`)), testTimeout)),
      ]);
      for (const fn of allAfterEach) await fn(fixtures);
      results.push({ name: fullName, passed: true, skipped: false, duration: Date.now() - start });
    } catch (err: unknown) {
      if ((err as Error).name === 'SkipError') {
        results.push({ name: fullName, passed: true, skipped: true, duration: 0 });
      } else {
        const errMsg = (err as Error).message || String(err);
        console.error(`    [FAIL] ${fullName}\n      ${errMsg.split('\n').slice(0, 5).join('\n      ')}`);
        results.push({
          name: fullName, passed: false, skipped: false,
          error: errMsg,
          duration: Date.now() - start,
        });
      }
    }
  }

  for (const child of suite.children) {
    const childPrefix = prefix ? `${prefix} > ${child.name}` : child.name;
    results.push(...await runSuite(child, allBeforeEach, allAfterEach, childPrefix));
  }

  for (const fn of suite.afterAll) await fn(fixtures);

  return results;
}

function formatResults(results: TestResult[]): string {
  const lines: string[] = [];
  let passed = 0, failed = 0, skipped = 0;

  for (const r of results) {
    if (r.skipped) { lines.push(`  - ${r.name} (skipped)`); skipped++; }
    else if (r.passed) { lines.push(`  ✓ ${r.name} (${r.duration}ms)`); passed++; }
    else { lines.push(`  ✗ ${r.name} (${r.duration}ms)`); lines.push(`    ${r.error}`); failed++; }
  }

  lines.push('');
  lines.push(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return lines.join('\n');
}

async function __runTests(): Promise<string> {
  const results = await runSuite(rootSuite, [], [], '');
  return formatResults(results);
}

// ─── Install on globalThis ─────────────────────────────────────────────────

/**
 * Installs test/expect/__runTests on globalThis.
 * Called explicitly for Node.js path, or auto-installs when loaded in browser.
 */
export function installFramework() {
  const _g = globalThis as any;
  _g.__test = test;
  _g.__expect = expect;
  _g.__runTests = __runTests;
  _g.__resetTestState = resetState;
  _g.__setGrep = (pattern: string | null) => { grepPattern = pattern ? new RegExp(pattern, 'i') : null; };
  _g.__setTimeout = (ms: number) => { testTimeout = ms; };
  resetState();
}

// Auto-install when loaded (browser path evaluates this as IIFE)
installFramework();
