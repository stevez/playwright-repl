/**
 * Test Runner Shim
 *
 * Lightweight test framework that replaces @playwright/test imports.
 * esbuild aliases '@playwright/test' to this file, so test files
 * use our runner without any code changes.
 *
 * Runs inside playwright-crx's service worker where `page`, `context`,
 * and `expect` are already available in scope.
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

const rootSuite: Suite = {
  name: '',
  tests: [],
  beforeAll: [],
  afterAll: [],
  beforeEach: [],
  afterEach: [],
  children: [],
};

let currentSuite = rootSuite;
let hasOnly = false;

// ─── Registration API ──────────────────────────────────────────────────────

function test(name: string, fn: TestFn) {
  currentSuite.tests.push({ name, fn, only: false, skip: false });
}

test.only = (name: string, fn: TestFn) => {
  hasOnly = true;
  currentSuite.tests.push({ name, fn, only: true, skip: false });
};

test.skip = (name: string, fn: TestFn) => {
  currentSuite.tests.push({ name, fn, only: false, skip: true });
};

test.describe = (name: string, fn: () => void) => {
  const suite: Suite = {
    name,
    tests: [],
    beforeAll: [],
    afterAll: [],
    beforeEach: [],
    afterEach: [],
    children: [],
  };
  currentSuite.children.push(suite);
  const parent = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = parent;
};

test.beforeAll = (fn: HookFn) => { currentSuite.beforeAll.push(fn); };
test.afterAll = (fn: HookFn) => { currentSuite.afterAll.push(fn); };
test.beforeEach = (fn: HookFn) => { currentSuite.beforeEach.push(fn); };
test.afterEach = (fn: HookFn) => { currentSuite.afterEach.push(fn); };

// ─── Runner ────────────────────────────────────────────────────────────────

// These globals are provided by playwright-crx's service worker scope.
// We access them via globalThis so esbuild doesn't try to resolve them.
/* eslint-disable @typescript-eslint/no-explicit-any */
const _page = (globalThis as any).page;
const _context = (globalThis as any).context;
const _expect = (globalThis as any).expect;
/* eslint-enable @typescript-eslint/no-explicit-any */

async function runSuite(
  suite: Suite,
  parentBeforeEach: HookFn[],
  parentAfterEach: HookFn[],
  prefix: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const fixtures = { page: _page, context: _context, expect: _expect };
  const allBeforeEach = [...parentBeforeEach, ...suite.beforeEach];
  const allAfterEach = [...suite.afterEach, ...parentAfterEach];

  // beforeAll
  for (const fn of suite.beforeAll) {
    await fn(fixtures);
  }

  // Run tests
  for (const t of suite.tests) {
    const fullName = prefix ? `${prefix} > ${t.name}` : t.name;

    if (t.skip || (hasOnly && !t.only)) {
      results.push({ name: fullName, passed: true, skipped: true, duration: 0 });
      continue;
    }

    const start = Date.now();
    try {
      for (const fn of allBeforeEach) await fn(fixtures);
      await t.fn(fixtures);
      for (const fn of allAfterEach) await fn(fixtures);
      results.push({ name: fullName, passed: true, skipped: false, duration: Date.now() - start });
    } catch (err: unknown) {
      results.push({
        name: fullName,
        passed: false,
        skipped: false,
        error: (err as Error).message || String(err),
        duration: Date.now() - start,
      });
    }
  }

  // Run child suites
  for (const child of suite.children) {
    const childPrefix = prefix ? `${prefix} > ${child.name}` : child.name;
    const childResults = await runSuite(child, allBeforeEach, allAfterEach, childPrefix);
    results.push(...childResults);
  }

  // afterAll
  for (const fn of suite.afterAll) {
    await fn(fixtures);
  }

  return results;
}

function formatResults(results: TestResult[]): string {
  const lines: string[] = [];
  let passed = 0, failed = 0, skipped = 0;

  for (const r of results) {
    if (r.skipped) {
      lines.push(`  - ${r.name} (skipped)`);
      skipped++;
    } else if (r.passed) {
      lines.push(`  ✓ ${r.name} (${r.duration}ms)`);
      passed++;
    } else {
      lines.push(`  ✗ ${r.name} (${r.duration}ms)`);
      lines.push(`    ${r.error}`);
      failed++;
    }
  }

  lines.push('');
  lines.push(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return lines.join('\n');
}

/**
 * Run all registered tests and return formatted results.
 * Called after the test file has been evaluated (all test/describe calls done).
 */
async function __runTests(): Promise<string> {
  const results = await runSuite(rootSuite, [], [], '');
  return formatResults(results);
}

// ─── Exports ───────────────────────────────────────────────────────────────

// Expose __runTests on globalThis so the bundler can call it after the IIFE.
// esbuild tree-shakes unexported functions, but globalThis assignments survive.
(globalThis as any).__runTests = __runTests;

export { test, _expect as expect };
