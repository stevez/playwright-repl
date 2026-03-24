/**
 * Test Runner Node.js Shim
 *
 * Replaces @playwright/test for compiler mode.
 * Same API as the browser shim, but runs in Node.js.
 * The compiler transforms page and expect calls to bridge.run().
 * This shim provides test/describe/hooks + the bridge connection.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

type TestFn = (fixtures: Record<string, unknown>) => Promise<void>;

interface TestEntry {
  name: string;
  fn: TestFn;
  only: boolean;
  skip: boolean;
}

interface Suite {
  name: string;
  tests: TestEntry[];
  beforeAll: TestFn[];
  afterAll: TestFn[];
  beforeEach: TestFn[];
  afterEach: TestFn[];
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

let rootSuite: Suite = {
  name: '', tests: [], beforeAll: [], afterAll: [],
  beforeEach: [], afterEach: [], children: [],
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
    name, tests: [], beforeAll: [], afterAll: [],
    beforeEach: [], afterEach: [], children: [],
  };
  currentSuite.children.push(suite);
  const parent = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = parent;
};

test.beforeAll = (fn: TestFn) => { currentSuite.beforeAll.push(fn); };
test.afterAll = (fn: TestFn) => { currentSuite.afterAll.push(fn); };
test.beforeEach = (fn: TestFn) => { currentSuite.beforeEach.push(fn); };
test.afterEach = (fn: TestFn) => { currentSuite.afterEach.push(fn); };

// ─── Bridge ────────────────────────────────────────────────────────────────

// The bridge object is injected by the test runner before execution.
// It provides bridge.run(expr) which sends to playwright-crx.
declare const bridge: { run: (command: string) => Promise<{ text?: string; isError?: boolean }> };

// ─── Runner ────────────────────────────────────────────────────────────────

async function runSuite(
  suite: Suite, parentBE: TestFn[], parentAE: TestFn[], prefix: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  // In compiler mode: page is null (compiler transforms page.* to bridge.run())
  // In debug mode: page is a real Playwright page (set on globalThis by connectOverCDP)
  const fixtures = {
    page: (globalThis as any).page ?? null,
    context: (globalThis as any).context ?? null,
    expect: (globalThis as any).expect ?? undefined,
  };
  const allBE = [...parentBE, ...suite.beforeEach];
  const allAE = [...suite.afterEach, ...parentAE];

  for (const fn of suite.beforeAll) await fn(fixtures);

  for (const t of suite.tests) {
    const fullName = prefix ? `${prefix} > ${t.name}` : t.name;
    if (t.skip || (hasOnly && !t.only)) {
      results.push({ name: fullName, passed: true, skipped: true, duration: 0 });
      continue;
    }
    const start = Date.now();
    try {
      for (const fn of allBE) await fn(fixtures);
      await t.fn(fixtures);
      for (const fn of allAE) await fn(fixtures);
      results.push({ name: fullName, passed: true, skipped: false, duration: Date.now() - start });
    } catch (err: unknown) {
      results.push({
        name: fullName, passed: false, skipped: false,
        error: (err as Error).message || String(err),
        duration: Date.now() - start,
      });
    }
  }

  for (const child of suite.children) {
    const childPrefix = prefix ? `${prefix} > ${child.name}` : child.name;
    results.push(...await runSuite(child, allBE, allAE, childPrefix));
  }

  for (const fn of suite.afterAll) await fn(fixtures);
  return results;
}

function formatResults(results: TestResult[]): string {
  let passed = 0, failed = 0, skipped = 0;
  const lines: string[] = [];
  for (const r of results) {
    if (r.skipped) { lines.push(`  - ${r.name} (skipped)`); skipped++; }
    else if (r.passed) { lines.push(`  \u2713 ${r.name} (${r.duration}ms)`); passed++; }
    else { lines.push(`  \u2717 ${r.name} (${r.duration}ms)\n    ${r.error}`); failed++; }
  }
  lines.push('');
  lines.push(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return lines.join('\n');
}

async function __runTests(): Promise<string> {
  const results = await runSuite(rootSuite, [], [], '');
  // Reset for next run
  rootSuite = {
    name: '', tests: [], beforeAll: [], afterAll: [],
    beforeEach: [], afterEach: [], children: [],
  };
  currentSuite = rootSuite;
  hasOnly = false;
  return formatResults(results);
}

// ─── Exports ───────────────────────────────────────────────────────────────

// expect stub — the compiler transforms expect() calls to bridge.run("await expect(...)"),
// so this is never actually called. But it must be exported so the import resolves.
function expect(..._args: unknown[]): unknown {
  throw new Error('expect() should not be called directly in compiler mode — the compiler transforms it to bridge.run()');
}

export { test, expect, __runTests };
