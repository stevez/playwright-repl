# Compiler for Test Runner — Per-Call Routing

## Context

The proxy approach (serializing all page.* calls through the bridge) is a dead end — callbacks, .then(), .catch(), Promise.all, and evaluate all break because the bridge can't handle callbacks or return complex objects.

We need a **parser + compiler** that analyzes test code and routes each call:
- Simple fire-and-forget `await page.XXX()` → **bridge** (fast, runs in SW)
- Everything else → **Node page** (real Playwright, full API)

## The One Rule

**Only** `await page.XXX();` as a standalone ExpressionStatement with no return value goes to bridge.

### Bridge (transform to `bridge.run("await page.XXX()")`):
```ts
await page.click('#btn');
await page.goto(url);
await page.fill('#input', 'text');
await page.setContent('<div>...</div>');
await expect(page.locator('h1')).toBeVisible();
```

### Node (keep as-is, runs on real Page):
```ts
const text = await page.textContent('h1');          // has return value
page.click().then(() => done = true);                // has .then callback
await page.evaluate(() => window.x);                 // evaluate — can return values
const el = await page.$('btn');                      // returns ElementHandle
page.on('console', msg => ...);                      // event listener callback
page.route(url, handler);                            // route callback
await Promise.all([page.waitFor...(), page.click()]); // concurrent — bridge deadlocks
const response = await page.goto(url);               // has return value
```

## AST Detection

Parse with **acorn** (lightweight JS parser, ~50KB). The check:

```
Is the expression an ExpressionStatement
  containing an AwaitExpression
    containing a page.* or expect(page.*) CallExpression
      with NO variable assignment (no `const x = ...`)
      and NO .then()/.catch() chain
      and NOT inside Promise.all/Promise.race
      and NOT page.evaluate/page.evaluateHandle
      and NOT page.$/page.$$/page.$eval/page.$$eval
      and NOT page.on/page.once/page.route
?
→ bridge call (transform to bridge.run("..."))
→ otherwise: leave as-is (runs on Node page)
```

## Transform Example

Input:
```ts
test('my test', async ({ page }) => {
  await page.goto('https://example.com');
  const title = await page.title();
  await page.click('#btn');
  await page.fill('#input', 'hello');
  await expect(page.locator('h1')).toBeVisible();
  page.on('console', msg => console.log(msg));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download-btn'),
  ]);
});
```

Output:
```ts
test('my test', async ({ page }) => {
  await __bridge('await page.goto("https://example.com")');
  const title = await page.title();                            // unchanged
  await __bridge('await page.click("#btn")');
  await __bridge('await page.fill("#input", "hello")');
  await __bridge('await expect(page.locator("h1")).toBeVisible()');
  page.on('console', msg => console.log(msg));                 // unchanged
  const [download] = await Promise.all([                       // unchanged
    page.waitForEvent('download'),
    page.click('#download-btn'),
  ]);
});
```

## Implementation

### New Files

```
packages/runner/src/
  compiler/
    parser.ts          — parse JS with acorn, walk AST to find page.* calls
    classify.ts        — classify each call as bridge or node
    transform.ts       — rewrite bridge calls using magic-string
    index.ts           — pipeline: parse → classify → transform
```

### Step 1: `compiler/parser.ts`

Parse JavaScript (post-esbuild TS stripping) with acorn and walk the AST to find all page-rooted expressions:

```ts
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export function findPageCalls(code: string): PageCallNode[] {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const calls: PageCallNode[] = [];

  walk.ancestor(ast, {
    ExpressionStatement(node, ancestors) {
      // Check if this is `await page.*(...)`
      if (isAwaitPageCall(node)) {
        calls.push({ node, ancestors: [...ancestors] });
      }
    }
  });

  return calls;
}
```

Key helper: `isPageRooted(node)` — walks a MemberExpression chain to check if the root identifier is `page`.

### Step 2: `compiler/classify.ts`

For each found page call, determine if it's bridge-eligible:

```ts
export function classifyCall(call: PageCallNode): 'bridge' | 'node' {
  const { node, ancestors } = call;

  // Must be ExpressionStatement > AwaitExpression > CallExpression
  if (!isExpressionStatement(node)) return 'node';

  const awaitExpr = node.expression;
  if (awaitExpr.type !== 'AwaitExpression') return 'node';

  const callExpr = awaitExpr.argument;

  // Check for .then()/.catch() chain
  if (hasPromiseChain(callExpr)) return 'node';

  // Check if inside Promise.all/Promise.race
  if (isInsidePromiseAll(ancestors)) return 'node';

  // Check for blacklisted methods
  const methodName = getMethodName(callExpr);
  if (NODE_ONLY_METHODS.has(methodName)) return 'node';

  // Check for variable assignment (parent is VariableDeclarator)
  // Already handled — ExpressionStatement can't have assignment

  return 'bridge';
}

const NODE_ONLY_METHODS = new Set([
  'evaluate', 'evaluateHandle',
  '$', '$$', '$eval', '$$eval',
  'on', 'once', 'off',
  'route', 'unroute', 'routeFromHAR',
  'waitForEvent', 'waitForResponse', 'waitForRequest',
  'frames', 'mainFrame',
]);
```

### Step 3: `compiler/transform.ts`

Rewrite bridge-classified calls using **magic-string** (preserves source maps):

```ts
import MagicString from 'magic-string';

export function transformBridgeCalls(
  code: string,
  bridgeCalls: PageCallNode[]
): { code: string; map: object } {
  const s = new MagicString(code);

  for (const call of bridgeCalls) {
    const { start, end } = call.node;
    // Extract the original expression text
    const original = code.slice(start, end).replace(/;$/, '');
    // Replace with bridge.run("...")
    const serialized = serializeExpression(original);
    s.overwrite(start, end, `await __bridge(${JSON.stringify(serialized)});`);
  }

  return { code: s.toString(), map: s.generateMap({ hires: true }) };
}
```

The `serializeExpression` function converts the expression to the string that the bridge evaluates. Variables in the expression (like `url` in `page.goto(url)`) need to be resolved at runtime — so the transform wraps them:

```ts
// For expressions with only literals:
await page.click('#btn')  →  await __bridge('await page.click("#btn")')

// For expressions with variables:
await page.goto(url)  →  await __bridge(`await page.goto(${JSON.stringify(url)})`)
```

Wait — this is harder. Variables need runtime resolution. Two approaches:
1. **Template literal**: `await __bridge(\`await page.goto("${url}")\`)` — but needs escaping
2. **Keep variable expressions on Node**: if args contain non-literal values, classify as `node`

**Decision: Approach 2** — if any argument is a variable/expression (not a string/number/boolean/regex literal), classify the whole call as `node`. This keeps the compiler simple and correct. Most Playwright calls use literals anyway.

### Step 4: `compiler/index.ts`

Pipeline that ties it all together:

```ts
export async function compileForBridge(testFilePath: string): Promise<string> {
  // 1. Strip TypeScript types
  const { code: jsCode } = await esbuild.transform(
    fs.readFileSync(testFilePath, 'utf-8'),
    { loader: 'ts' }
  );

  // 2. Parse and find page calls
  const pageCalls = findPageCalls(jsCode);

  // 3. Classify each call
  const bridgeCalls = pageCalls.filter(c => classifyCall(c) === 'bridge');

  // 4. Transform bridge calls
  if (bridgeCalls.length === 0) return jsCode; // pure node mode
  const { code: transformed } = transformBridgeCalls(jsCode, bridgeCalls);

  return transformed;
}
```

### Step 5: Integration with `execute.ts`

The Node path becomes a **hybrid**: most calls run on the real Node page, bridge-classified calls go through `bridge.run()`:

```ts
async function executeNode(testFilePath, bridge, nodePage, cdpPage) {
  // page = real Playwright Page (for node calls)
  // __bridge = sends to SW (for bridge calls)
  globalThis.__bridge = (cmd) => bridge.run(cmd);
  globalThis.page = cdpPage || nodePage;

  const compiled = await compileForBridge(testFilePath);
  // ... bundle and run
}
```

### Variable Argument Handling (Simplified)

For the initial version, only transform calls where ALL arguments are **literals**:

```ts
function hasOnlyLiteralArgs(callExpr): boolean {
  return callExpr.arguments.every(arg =>
    arg.type === 'Literal' ||           // string, number, boolean
    arg.type === 'RegExpLiteral' ||     // /pattern/
    arg.type === 'TemplateLiteral' ||   // `template`
    arg.type === 'ObjectExpression' ||  // { key: 'value' } — check recursively
    arg.type === 'ArrayExpression'      // ['a', 'b'] — check recursively
  );
}
```

If any argument is a variable reference, the call stays on Node. This is conservative but correct. We can optimize later.

### Dependencies

- `acorn` (~25KB) + `acorn-walk` (~5KB) — AST parsing
- `magic-string` (~15KB) — source-map-preserving string replacement

All lightweight. No Babel needed.

### Verification

1. **Unit tests** (`compiler/classify.test.ts`):
   - `await page.click('#btn')` → bridge
   - `const x = await page.title()` → node
   - `page.click().then(() => ...)` → node
   - `page.on('console', fn)` → node
   - `await page.evaluate(() => x)` → node
   - `await Promise.all([...])` → node
   - `await page.goto(variable)` → node (non-literal arg)
   - `await expect(page.locator('h1')).toBeVisible()` → bridge

2. **Transform tests** (`compiler/transform.test.ts`):
   - Output is valid JS
   - bridge.run calls contain correct serialized expressions
   - Non-bridge calls unchanged

3. **E2E**: run page-click.spec.ts through compiler path
   - Compare results vs direct Node path (should be identical)
   - Verify bridge calls happen (counter > 0)

4. **Benchmark**: compiler path vs node-direct vs standard Playwright

### Files to Modify

- `packages/runner/src/compiler/` — NEW: parser, classify, transform, index
- `packages/runner/src/execute.ts` — integrate compiler pipeline
- `packages/runner/package.json` — add acorn, acorn-walk, magic-string
