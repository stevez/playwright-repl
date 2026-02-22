# Extension Package: JavaScript → TypeScript Migration

## Context

Migrating `packages/extension/` from JavaScript to TypeScript. Core and CLI migrations are handled separately. The extension is a Chrome DevTools side panel (Manifest V3) with 4 source files, 4 unit test files, and 6 e2e test files.

## Approach

- **Vite** as build tool (already used in `packages/repl-ext/`, handles TS natively via esbuild)
- **`src/` folder** for all source code — clean separation from config, tests, and output
- **`public/` folder** for static assets (manifest.json, icons) — Vite copies these to dist/ as-is
- **`dist/` folder** is the final Chrome extension package — load this in Chrome
- **`tsconfig.json`** for type checking (Vite uses esbuild for actual compilation, tsc is type-check only)
- Unit tests import from `src/` directly (vitest handles .ts natively)
- E2e tests also `.ts` — core package imports use temporary `declare module` stubs

## New Folder Structure

```
packages/extension/
├── src/                        # All TypeScript source
│   ├── background.ts           # Service worker
│   ├── panel/
│   │   ├── panel.html          # Vite HTML entry point
│   │   ├── panel.ts
│   │   └── panel.css
│   ├── content/
│   │   └── recorder.ts         # IIFE content script (no imports/exports)
│   └── lib/
│       └── converter.ts        # Pure utility functions
├── test/                       # Vitest unit tests
│   ├── setup.ts
│   ├── converter.test.ts
│   ├── background.test.ts
│   ├── recorder.test.ts
│   └── panel.test.ts
├── e2e/                        # Playwright E2E tests
│   ├── commands/
│   │   ├── fixtures.ts
│   │   └── commands.test.ts
│   ├── panel/
│   │   ├── fixtures.ts
│   │   └── panel.test.ts
│   └── recording/
│       ├── fixtures.ts
│       └── recording.test.ts
├── public/                     # Static assets (copied to dist/ by Vite)
│   ├── manifest.json
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── dist/                       # Build output (Chrome loads from here)
├── types.d.ts                  # Global type declarations
├── tsconfig.json               # Type checking config
├── vite.config.ts              # Vite build config
├── vitest.config.ts            # Vitest test config
├── playwright.config.ts        # E2E test config
└── package.json
```

## Steps

### 1. Add build infrastructure

**Create `vite.config.ts`:**
```ts
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        'content/recorder': resolve(__dirname, 'src/content/recorder.ts'),
        'panel/panel': resolve(__dirname, 'src/panel/panel.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  publicDir: 'public',
});
```

Key points:
- `panel.html` is an HTML entry — Vite processes `<script>` and `<link>` tags, bundles panel.ts + panel.css, outputs processed HTML
- `background.ts` and `content/recorder.ts` are JS entry points — output as standalone `.js` files
- `recorder.ts` is an IIFE with no imports/exports — Rollup preserves the IIFE as-is since entry points aren't tree-shaken
- `public/manifest.json` and `public/icons/` are copied to `dist/` automatically

**Create `tsconfig.json`** (type checking only — Vite handles compilation):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test", "e2e", "types.d.ts"]
}
```

**Create `types.d.ts`:**
- Extend `Window` with `__pwRecorderCleanup?: () => void`
- Declare module for `vitest-chrome/lib/index.esm.js`
- Temporary `declare module` stubs for core package imports:
  ```ts
  // TODO: Remove once @playwright-repl/core exports its own types
  declare module '../../../core/src/engine.mjs' {
    export class Engine {
      start(opts: Record<string, unknown>): Promise<void>;
      close(): Promise<void>;
    }
  }
  declare module '../../../core/src/extension-server.mjs' {
    export class CommandServer {
      constructor(engine: unknown);
      port: number;
      start(port: number): Promise<void>;
      close(): Promise<void>;
    }
  }
  ```
  Once core is TypeScript, delete these stubs and use real imports from `@playwright-repl/core`

**Update `package.json`:**
- Add devDependencies: `typescript`, `@types/chrome`, `vite`
- Scripts:
  ```json
  "build": "vite build",
  "typecheck": "tsc",
  "test": "vitest run",
  "test:e2e": "npx playwright test",
  "test:coverage": "vitest run --coverage"
  ```

### 2. Move and rename source files into `src/`

| From | To |
|------|-----|
| `background.js` | `src/background.ts` |
| `panel/panel.js` | `src/panel/panel.ts` |
| `panel/panel.html` | `src/panel/panel.html` |
| `panel/panel.css` | `src/panel/panel.css` |
| `content/recorder.js` | `src/content/recorder.ts` |
| `lib/converter.js` | `src/lib/converter.ts` |
| `manifest.json` | `public/manifest.json` |
| `icons/` | `public/icons/` |

### 3. Update `src/panel/panel.html`

Update the script and stylesheet references to use TypeScript source (Vite resolves these):
```html
<script type="module" src="panel.ts"></script>
<link rel="stylesheet" href="panel.css">
```

### 4. Convert `src/lib/converter.ts` (simplest, no Chrome APIs)

- Add param/return types: `tokenize(raw: string): string[]`, `pwToPlaywright(cmd: string): string | null`
- No other changes needed (pure functions, already ESM exports)

### 5. Convert `src/content/recorder.ts` (IIFE, no imports/exports)

- Must remain a script (no import/export) — the IIFE is preserved in Rollup output
- Add type annotations to function params (`el: Element`, `e: MouseEvent`, etc.)
- Type narrow DOM elements: `el as HTMLInputElement`, `el as HTMLSelectElement`, etc.
- Type state variables: `fillTimer: ReturnType<typeof setTimeout> | null`, etc.
- `window.__pwRecorderCleanup` uses the `Window` extension from `types.d.ts`
- `chrome` global comes from `@types/chrome`

### 6. Convert `src/background.ts`

- Replace CJS export guard with ESM named exports: `export async function startRecording(...)`, etc.
- Type state variables: `recordingTabId: number | null`, listener types, etc.
- Type function params and return types
- `navCommittedListener` callback typed per `chrome.webNavigation.onCommitted` listener signature

### 7. Convert `src/panel/panel.ts`

- All `document.getElementById()` calls need non-null assertions and specific casts:
  ```ts
  const output = document.getElementById("output") as HTMLDivElement;
  const input = document.getElementById("command-input") as HTMLInputElement;
  const editor = document.getElementById("editor") as HTMLTextAreaElement;
  ```
- Define `RunResult` interface: `{ text: string; isError: boolean; image?: string }`
- Type `filterResponse`, `responseHistory`, and all function params
- Update import: `import { pwToPlaywright } from "../lib/converter.js"` (keep `.js` — Vite resolves `.js` → `.ts`)

### 8. Update `public/manifest.json`

- Add `"type": "module"` to background config (background.ts compiles to ESM):
  ```json
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
  ```
- File path references stay the same (background.js, panel/panel.html, content/recorder.js) since Vite outputs match this structure

### 9. Convert unit tests (.js → .ts)

- Move from `test/*.js` → `test/*.ts`
- Update import paths to reference `src/`:
  - `from "../lib/converter.js"` → `from "../src/lib/converter.js"`
  - `await import("../background.js")` → `await import("../src/background.js")`
  - `await import("../content/recorder.js")` → `await import("../src/content/recorder.js")`
  - `await import("../panel/panel.js")` → `await import("../src/panel/panel.js")`
- Add type annotations, `as any` casts on chrome mock setup
- Type `sendMessageSpy`, DOM element casts, mock fetch objects

### 10. Update config files

**`vitest.config.ts`** (rename from .js):
- Update `setupFiles: "./test/setup.ts"`
- Update coverage includes: `["src/**/*.ts"]`
- Add `dist/**` to excludes

**`playwright.config.ts`** (rename from .js):
- Minimal changes, just rename

### 11. Convert e2e tests (.mjs → .ts)

**`e2e/panel/fixtures.ts`** and **`e2e/recording/fixtures.ts`**:
- `EXTENSION_PATH` → `path.resolve(__dirname, '../../dist')`
- Type the custom fixture interfaces
- Import from `./fixtures.js` in test files

**`e2e/commands/fixtures.ts`**:
- Core imports use `declare module` stubs from `types.d.ts`
- Type the `run` fixture

**All e2e test files** (`.mjs` → `.ts`):
- Update imports: `from './fixtures.js'`
- Type helper functions (`findRef`, `countTabs`, `startRecordingOn`, etc.)

### 12. Update .gitignore

- Add `dist/` under the extension package

### 13. Delete old files

- Remove original `background.js`, `panel/`, `content/`, `lib/`, `icons/`, `manifest.json` from package root (now in `src/` and `public/`)

## Files Summary

| Action | File |
|--------|------|
| Create | `vite.config.ts` |
| Create | `tsconfig.json` |
| Create | `types.d.ts` |
| Create | `public/manifest.json` (moved from root) |
| Create | `public/icons/` (moved from root) |
| Move+Edit | `background.js` → `src/background.ts` |
| Move+Edit | `panel/panel.js` → `src/panel/panel.ts` |
| Move+Edit | `panel/panel.html` → `src/panel/panel.html` |
| Move | `panel/panel.css` → `src/panel/panel.css` |
| Move+Edit | `content/recorder.js` → `src/content/recorder.ts` |
| Move+Edit | `lib/converter.js` → `src/lib/converter.ts` |
| Rename+Edit | `test/setup.js` → `test/setup.ts` |
| Rename+Edit | `test/converter.test.js` → `test/converter.test.ts` |
| Rename+Edit | `test/background.test.js` → `test/background.test.ts` |
| Rename+Edit | `test/recorder.test.js` → `test/recorder.test.ts` |
| Rename+Edit | `test/panel.test.js` → `test/panel.test.ts` |
| Rename+Edit | `vitest.config.js` → `vitest.config.ts` |
| Rename+Edit | `playwright.config.js` → `playwright.config.ts` |
| Rename+Edit | `e2e/panel/fixtures.mjs` → `e2e/panel/fixtures.ts` |
| Rename+Edit | `e2e/panel/panel.test.mjs` → `e2e/panel/panel.test.ts` |
| Rename+Edit | `e2e/recording/fixtures.mjs` → `e2e/recording/fixtures.ts` |
| Rename+Edit | `e2e/recording/recording.test.mjs` → `e2e/recording/recording.test.ts` |
| Rename+Edit | `e2e/commands/fixtures.mjs` → `e2e/commands/fixtures.ts` |
| Rename+Edit | `e2e/commands/commands.test.mjs` → `e2e/commands/commands.test.ts` |
| Edit | `package.json` |
| Delete | Old root-level `background.js`, `panel/`, `content/`, `lib/`, `icons/`, `manifest.json` |

## Verification

1. `npm install` — installs vite, typescript, @types/chrome
2. `npx tsc` — type checking passes with no errors
3. `npm run build` — Vite builds to dist/ with correct structure
4. Verify `dist/` contains: `manifest.json`, `icons/`, `background.js`, `panel/panel.html`, `panel/panel.js`, `panel/panel.css`, `content/recorder.js`
5. `npm test` — all vitest unit tests pass
6. Manually load `dist/` as unpacked Chrome extension to verify it works
7. `npm run test:e2e` — e2e tests pass (if server infrastructure available)
