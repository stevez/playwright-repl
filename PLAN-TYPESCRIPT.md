# TypeScript Migration: packages/core + packages/cli

## Context

The codebase is stable with 59 E2E tests + 389 unit tests passing. All features (recording, tabs, commands) are shipped. This is a good pause point to migrate `packages/core` (8 source files, 939 lines) and `packages/cli` (3 source files + 1 bin entry, 927 lines) from plain `.mjs` to TypeScript for type safety.

The extension (`packages/extension`) stays as plain JS for now — React + Vite migration is planned separately.

## Strategy

- **Rename** `.mjs` → `.ts` for all source and test files
- **Build** with `tsc` to `dist/` — required because the CLI bin entry (`playwright-repl`) must run as plain Node.js
- **Type gradually** — start with `any` for Playwright internals (no public types for internal APIs), add proper types for our own interfaces
- **Migrate one package at a time** — core first, then cli

## Key Challenge: createRequire Hack

`engine.mjs` uses `createRequire(import.meta.url)` to bypass Playwright's exports map and import internal modules (`lib/mcp/browser/browserServerBackend.js`, etc.). These have no type definitions.

**Solution**: Create a `src/playwright-internals.d.ts` declaring the shapes we use with minimal types. The `loadDeps()` function returns a typed object instead of `any`.

## Files to Rename

### packages/core/src/ (8 files)
- `engine.mjs` → `engine.ts`
- `parser.mjs` → `parser.ts`
- `extension-server.mjs` → `extension-server.ts`
- `resolve.mjs` → `resolve.ts`
- `page-scripts.mjs` → `page-scripts.ts`
- `completion-data.mjs` → `completion-data.ts`
- `colors.mjs` → `colors.ts`
- `index.mjs` → `index.ts`

### packages/core/test/ (5 files)
- `engine.test.mjs` → `engine.test.ts`
- `parser.test.mjs` → `parser.test.ts`
- `extension-server.test.mjs` → `extension-server.test.ts`
- `completion-data.test.mjs` → `completion-data.test.ts`
- `page-scripts.test.mjs` → `page-scripts.test.ts`

### packages/cli/src/ (3 files)
- `repl.mjs` → `repl.ts`
- `recorder.mjs` → `recorder.ts`
- `index.mjs` → `index.ts`

### packages/cli/test/ (6 files)
- `repl-processline.test.mjs` → `repl-processline.test.ts`
- `repl-integration.test.mjs` → `repl-integration.test.ts`
- `recorder.test.mjs` → `recorder.test.ts`
- `repl-helpers.test.mjs` → `repl-helpers.test.ts`
- `repl-startrepl.test.mjs` → `repl-startrepl.test.ts`
- `index.test.mjs` → `index.test.ts`

### packages/cli/bin/ (1 file)
- `playwright-repl.mjs` → `playwright-repl.ts` — compiled to `dist/` by tsc, `bin` field points to `dist/playwright-repl.js`

## Steps

### Step 1: Add TypeScript infrastructure

**New files:**
- `tsconfig.base.json` (root) — shared compiler options
- `packages/core/tsconfig.json` — extends base
- `packages/cli/tsconfig.json` — extends base, references core

**Root tsconfig.base.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

**Install:** `npm install -D typescript @types/node @types/minimist` at root

### Step 2: Migrate packages/core

1. `git mv` all `.mjs` → `.ts` (source + test files)
2. Create `src/playwright-internals.d.ts` — type stubs for Playwright internal APIs
3. Add type annotations to all exported functions and classes
4. Update internal imports: `'./resolve.mjs'` → `'./resolve.js'` (TypeScript with Node16 resolution requires `.js` extensions in imports, which resolve to `.ts` at compile time)
5. Update `package.json`:
   - `"main": "./dist/index.js"`
   - `"exports": { ".": "./dist/index.js" }`
   - `"types": "./dist/index.d.ts"`
   - Add `"build": "tsc"` script
6. Update `vitest.config.mjs` → `vitest.config.ts`: change include to `['test/**/*.test.ts']`
7. Run `tsc --noEmit` to check types, fix errors
8. Run `npm test -w packages/core` to verify all 167 tests pass

### Step 3: Migrate packages/cli

1. `git mv` all `.mjs` → `.ts` (source + test files)
2. Add type annotations to exported functions
3. Update imports:
   - `'@playwright-repl/core'` stays the same
   - `'./recorder.mjs'` → `'./recorder.js'`
   - `'./repl.mjs'` → `'./repl.js'`
4. `git mv bin/playwright-repl.mjs` → `src/playwright-repl.ts`:
   - Move into `src/` so tsc compiles it to `dist/playwright-repl.js`
   - Update import: `'../src/repl.mjs'` → `'./repl.js'` (same directory after compilation)
   - Update import: `from '@playwright-repl/core'` stays the same
   - Keep the `#!/usr/bin/env node` shebang — tsc preserves it
   - Delete `bin/` directory (no longer needed)
5. Update `package.json`:
   - `"main": "./dist/index.js"`
   - `"exports": { ".": "./dist/index.js" }`
   - `"types": "./dist/index.d.ts"`
   - `"bin": { "playwright-repl": "./dist/playwright-repl.js" }` (points to compiled output)
   - `"files": ["dist/"]` (ship compiled JS only)
   - Add `"build": "tsc"` script
6. Update `vitest.config.mjs` → `vitest.config.ts`
7. Run `tsc --noEmit`, fix errors
8. Run `npm test -w packages/cli` to verify all 222 tests pass

### Step 4: Update extension E2E imports

Current:
```js
import { Engine } from '../../../core/src/engine.mjs';
import { CommandServer } from '../../../core/src/extension-server.mjs';
```

Change to use the package name (works via npm workspaces):
```js
import { Engine, CommandServer } from '@playwright-repl/core';
```

### Step 5: Update root package.json and CI

- Add root scripts: `"build": "npm run build --workspaces --if-present"`
- Update `.github/workflows/test.yml`: add build step before tests
- Add `.gitignore` entries for `packages/*/dist/`
- Add `tsc --noEmit` type checking step to CI

### Step 6: Verify everything

1. `npm run build` — both packages compile cleanly
2. `npm test` — all 389 unit tests pass
3. `npx playwright test` (in packages/extension) — all 59 E2E tests pass
4. `npx playwright-repl --help` — CLI works
5. `tsc --noEmit` — no type errors

## Import Extension Convention

TypeScript with `"module": "Node16"` requires `.js` extensions in relative imports (even though the source files are `.ts`). This is by design — TypeScript doesn't rewrite import specifiers, and at runtime the files will be `.js`.

```ts
// In source .ts files:
import { parseInput } from './parser.js';     // resolves to parser.ts at compile time
import { Engine } from './engine.js';          // resolves to engine.ts at compile time
```

## What Does NOT Change

- `packages/extension/` — stays as plain JS
- `packages/extension/e2e/` test files — stay as `.mjs`
- `packages/extension/test/` unit tests — stay as `.js`
- `packages/cli/bin/` directory — deleted, bin entry moves to `src/playwright-repl.ts` and compiles to `dist/`
