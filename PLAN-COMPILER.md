# Dual-Mode Test Runner — Browser Fast Path + Node.js Compiler Fallback

Issue: #339

## Goal

Keep the current shim/browser approach for pure browser tests (fastest, 0ms overhead).
Add a compiler-based Node.js fallback for tests that need Node.js APIs (`fs`, `process.env`,
fixtures, globalSetup). Both paths use playwright-crx via bridge for page execution.

## Dual-Mode Detection

```
test.spec.ts
  → scan for Node.js imports (fs, path, child_process, etc.)
  → scan for process.env, require(), globalSetup references

  No Node.js detected → BROWSER MODE (current shim, 0ms overhead)
  Node.js detected    → COMPILER MODE (Node.js host, ~2ms per page call)
```

Both modes use the same bridge + playwright-crx. The difference is where the
test code runs:

| | Browser Mode | Compiler Mode |
|---|---|---|
| Test runs in | Browser (service worker) | Node.js (extension host) |
| page.* overhead | 0ms (in-process) | ~2ms (bridge hop) |
| Node.js APIs | ❌ | ✅ |
| process.env | ❌ | ✅ |
| Fixtures | ❌ | ✅ |
| globalSetup | ❌ | ✅ |
| npm packages | Browser-only | All |
| Debugging | Custom DAP + source maps | VS Code built-in Node.js debugger |

## Architecture

### Browser Mode (current — pure browser tests)

```
VS Code
  └── esbuild bundle (shim + test → IIFE)
        └── bridge.runScript(bundledJs)
              └── playwright-crx executes everything in-process (fastest)
```

### Compiler Mode (new — mixed Node.js + browser tests)

```
┌─────────────────────────────────────────────────────┐
│  Node.js (VS Code extension host)                   │
│                                                     │
│  1. Read playwright.config.ts                       │
│  2. Run globalSetup                                 │
│  3. For each test file:                             │
│     a. Compile: transform page/expect → bridge      │
│     b. Execute in Node.js                           │
│        - Node.js code runs natively                 │
│        - page/expect lines → bridge.run("...")      │
│  4. Run globalTeardown                              │
│  5. Report results                                  │
│                                                     │
│        │ bridge.run("await page.click(...)")         │
│        ▼                                            │
│  ┌──────────────────────────────────────────┐       │
│  │  Bridge (WebSocket :9876)                │       │
│  └──────────┬───────────────────────────────┘       │
└─────────────┼───────────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────┐
│  Chromium (playwright-crx)                          │
│  page, context, expect all execute here (fast)      │
└─────────────────────────────────────────────────────┘
```

## What the compiler transforms

### Pure browser lines → wrap as bridge string

```typescript
// Input:
await page.goto('/login');
await page.locator('.btn').click();
await expect(page.locator('h1')).toHaveText('Hello');

// Output:
await bridge.run("await page.goto('/login')");
await bridge.run("await page.locator('.btn').click()");
await bridge.run("await expect(page.locator('h1')).toHaveText('Hello')");
```

### Mixed lines (Node.js + browser) → extract, serialize, inject

```typescript
// Input:
const data = fs.readFileSync('fixture.json', 'utf-8');
await page.fill('#input', JSON.parse(data).name);
await page.goto(process.env.BASE_URL + '/dashboard');

// Output:
const data = fs.readFileSync('fixture.json', 'utf-8');
const __arg0 = JSON.parse(data).name;
await bridge.run(`await page.fill('#input', ${JSON.stringify(__arg0)})`);
const __arg1 = process.env.BASE_URL + '/dashboard';
await bridge.run(`await page.goto(${JSON.stringify(__arg1)})`);
```

### Node.js lines → untouched

```typescript
// These stay exactly as-is:
const data = fs.readFileSync('fixture.json');
const parsed = JSON.parse(data);
console.log('Running test...');
process.env.DEBUG = 'true';
```

## Detection rules

A line is a "browser line" if it contains:
- `page.` followed by a method call
- `expect(page` or `expect(locator`
- A locator variable that was assigned from `page.locator()`

A line is "mixed" if it's a browser line that references Node.js variables.

Everything else is a Node.js line.

## Implementation phases

### Phase 1: Basic compiler (MVP)

Simple regex/string-based detection:
1. Lines starting with `await page.` → wrap as bridge string
2. Lines starting with `await expect(page` → wrap as bridge string
3. All arguments are string literals → direct wrap (no variable extraction)
4. Everything else → leave in Node.js

This handles 80% of tests — pure `page.*` calls with literal arguments.

### Phase 2: Variable extraction

For mixed lines where Node.js variables are passed to browser calls:
1. Parse the line's AST (TypeScript compiler API)
2. Identify arguments that reference Node.js scope variables
3. Extract them to temporary variables
4. Serialize with `JSON.stringify` and inject into bridge string

### Phase 3: Return values

For lines that read values from the browser:
```typescript
// Input:
const title = await page.title();
const url = await page.url();
const text = await page.locator('h1').textContent();

// Output:
const title = JSON.parse(await bridge.run("JSON.stringify(await page.title())"));
const url = JSON.parse(await bridge.run("JSON.stringify(await page.url())"));
const text = JSON.parse(await bridge.run("JSON.stringify(await page.locator('h1').textContent())"));
```

### Phase 4: Config + fixtures

1. Read `playwright.config.ts` — testDir, baseURL, timeout, projects
2. Provide fixtures: `{ page: bridgePage, baseURL, browserName, ... }`
3. Run globalSetup/globalTeardown as Node.js scripts
4. Apply timeouts, retries per config

## Node.js test runner

Replaces the shim. Runs in Node.js, not the browser:

```typescript
// test-runner-node.ts
import { BridgeServer } from '@playwright-repl/core';

const bridge = getBridge(); // existing bridge connection

function test(name, fn) {
  registeredTests.push({ name, fn });
}
test.describe = (name, fn) => { ... };
test.beforeEach = (fn) => { ... };
// ... same API as current shim

// Fixtures include bridge-backed page
const fixtures = {
  page: null,  // compiler replaces page.* calls with bridge.run()
  baseURL: config.use?.baseURL,
  browserName: 'chromium',
};

// Run tests
for (const t of tests) {
  await t.fn(fixtures);
}
```

## Mode selection logic

```typescript
function selectMode(source: string): 'browser' | 'compiler' {
  const nodeModules = ['fs', 'path', 'child_process', 'os', 'crypto',
    'http', 'https', 'net', 'stream', 'util', 'worker_threads'];

  for (const mod of nodeModules) {
    if (source.includes(`from '${mod}'`) ||
        source.includes(`from "node:${mod}"`) ||
        source.includes(`require('${mod}')`))
      return 'compiler';
  }

  if (source.includes('process.env')) return 'compiler';

  return 'browser';
}
```

## Integration with existing features

### Browser mode (unchanged)
- Test Explorer ▶ Run → esbuild bundle + shim → browser (fastest)
- Test Explorer ▷ Debug → custom DAP + CDP + source maps

### Compiler mode (new)
- Test Explorer ▶ Run → compile transform → Node.js + bridge
- Test Explorer ▷ Debug → VS Code built-in Node.js debugger (no custom DAP!)
- Recording → still works (bridge events)
- Locator picker → still works (bridge events)
- REPL → still direct bridge commands

### User experience
```
User clicks ▶ Run on a test:
  → VS Code scans file
  → "No Node.js imports → running in fast mode ⚡"  (browser)
  → OR "Node.js detected → running in compatible mode" (compiler)
  → Results appear in Test Explorer either way
```

User doesn't choose — it's automatic. Fast when possible, compatible when needed.

## What compiler mode replaces (vs browser mode)

| | Browser mode | Compiler mode |
|---|---|---|
| Test runner | test-runner.ts (shim) | test-runner-node.ts |
| Bundling | esbuild full bundle + IIFE | esbuild TS→JS + AST transform |
| Execution | Browser runs everything | Node.js host, page/expect → bridge |
| Node.js APIs | ❌ | ✅ |
| Debugger | Custom DAP + CDP | VS Code built-in Node.js debugger |
| Source maps | VLQ parsing needed | Not needed |

## What stays the same (both modes)

- Bridge connection (WebSocket :9876)
- playwright-crx in Chrome (fast page execution)
- Test Explorer integration (same UI, auto-selects mode)
- Recording + locator picker
- REPL (direct bridge commands)

## Debugging per mode

### Browser mode (current custom DAP)
- Breakpoints → CDP Debugger.setBreakpoint
- Step → CDP Debugger.stepOver
- Variables → CDP Runtime.getProperties
- Source maps → custom VLQ parsing

### Compiler mode (VS Code built-in)
- Breakpoints → Node.js pauses natively
- Step over → next Node.js line, bridge.run() executes and returns
- Variables → real Node.js variables
- No custom DAP, no CDP for debugging, no source maps

## Risks

1. **Variable extraction** — detecting which arguments are Node.js values vs literals
   is complex for deeply nested expressions
2. **Return values** — `const el = page.locator('.btn')` returns a locator that's used
   later. Need to track locator references across lines
3. **Callbacks** — `page.on('dialog', handler)` — the handler runs in Node.js but the
   event fires in the browser. Needs special handling
4. **Performance** — ~2ms per bridge call. 20 calls = ~40ms. Acceptable for dev
5. **Detection accuracy** — some npm packages internally use Node.js APIs but appear
   browser-compatible. May need manual override: `// @playwright-ide node`

## Timeline

| Phase | What | Effort |
|-------|------|--------|
| Phase 0 | Mode detection (scan for Node.js imports, auto-switch) | 0.5 day |
| Phase 1 | Basic compiler (wrap `page.*`/`expect` as bridge strings) | 1 day |
| Phase 2 | Variable extraction (serialize Node.js args into bridge strings) | 1-2 days |
| Phase 3 | Return values (`page.title()` → result back to Node.js) | 1 day |
| Phase 4 | Config + fixtures (playwright.config.ts, baseURL, globalSetup) | 1-2 days |
| Phase 5 | Debug integration (VS Code built-in Node.js debugger for compiler mode) | 1 day |

Browser mode (current) stays unchanged throughout. Each phase adds capability to compiler mode.
