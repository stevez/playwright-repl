# #88 — Snapshot as expandable tree in console

## Context

The `snapshot` command returns a YAML accessibility tree (from Playwright's `_snapshotForAI()`). Currently rendered as a flat `<pre>` block in the console. Goal: parse the YAML into a tree and render it as a collapsible component, so users can expand/collapse nodes.

## Current flow

```
snapshot command
  → useConsole.ts:36 — detects SNAPSHOT_CMDS, returns { codeBlock: result.text }
  → useConsole.ts:114 — dispatches { type: 'COMMAND_SUCCESS', line: { text, type: 'snapshot' } }
  → Console/index.tsx:29 — sets entry.codeBlock = next.text
  → ConsoleEntry.tsx:23-30 — renders <pre> with Copy button
```

## Approach

### 0. Install js-yaml

```bash
pnpm --filter @playwright-repl/extension add js-yaml
pnpm --filter @playwright-repl/extension add -D @types/js-yaml
```

### 1. Create snapshot parser

**New file:** [packages/extension/src/panel/lib/snapshot-parser.ts](packages/extension/src/panel/lib/snapshot-parser.ts)

Use `js-yaml` to parse the YAML snapshot into a nested structure, then convert to our tree type.

The snapshot YAML looks like:
```
- document [ref=e1]:
  - navigation "Main" [ref=e2]:
    - link "Home" [ref=e3]
  - main [ref=e5]:
    - heading "Welcome" [level=1] [ref=e6]
```

`yaml.load()` will parse this into nested arrays/objects. Define a `SnapshotNode` type and a conversion function:

```ts
import yaml from 'js-yaml';

export interface SnapshotNode {
  text: string;        // e.g. 'navigation "Main"'
  ref?: string;        // e.g. 'e2'
  children: SnapshotNode[];
}

export function parseSnapshot(yamlText: string): SnapshotNode[]
```

- Parse with `yaml.load(yamlText)`
- Walk the resulting structure to build `SnapshotNode[]`
- Extract `[ref=eN]` from the keys using regex

### 2. Create SnapshotTree component

**New file:** [packages/extension/src/panel/components/Console/SnapshotTree.tsx](packages/extension/src/panel/components/Console/SnapshotTree.tsx)

Simpler than ObjectTree (no lazy loading, no CDP). Reuse existing `.ot-` CSS classes for consistent look.

```tsx
function SnapshotTree({ nodes }: { nodes: SnapshotNode[] }) {
  // Render each node with ▶/▼ toggle if it has children
  // Collapsed by default for depth > 1
  // Show ref as a dimmed label: e.g. [e5]
}
```

Keep the Copy button (copy original YAML text).

### 3. Wire into ConsoleEntry

**Modify:** [packages/extension/src/panel/components/Console/ConsoleEntry.tsx](packages/extension/src/panel/components/Console/ConsoleEntry.tsx)

In the `codeBlock` rendering branch (line 23), check if the codeBlock looks like a snapshot (starts with `- `). If so, parse and render `<SnapshotTree>` instead of `<pre>`. Otherwise keep `<pre>` for other code blocks (like `export` output).

```tsx
entry.codeBlock !== undefined ? (
  isSnapshotYaml(entry.codeBlock)
    ? <SnapshotTreeBlock text={entry.codeBlock} />
    : <div data-type="snapshot">...<pre>...</pre>...</div>
)
```

No changes needed to types, reducer, useConsole, or Console/index.tsx.

## Files to create/modify

1. **Create** [packages/extension/src/panel/lib/snapshot-parser.ts](packages/extension/src/panel/lib/snapshot-parser.ts) — `SnapshotNode` type + `parseSnapshot()` function
2. **Create** [packages/extension/src/panel/components/Console/SnapshotTree.tsx](packages/extension/src/panel/components/Console/SnapshotTree.tsx) — collapsible tree component
3. **Modify** [packages/extension/src/panel/components/Console/ConsoleEntry.tsx](packages/extension/src/panel/components/Console/ConsoleEntry.tsx) — branch on snapshot vs code-block rendering

## Styling notes

- Reuse `.ot-toggle`, `.ot-children`, `.ot-row` classes from [panel.css](packages/extension/src/panel/panel.css) (lines 213-235)
- Ref labels (`[e5]`) in dimmed color (`var(--text-dim)`)
- Node role/name in default text color
- Quoted text (like `"Main"`) in string color (`var(--color-string)`)
- You may want to add a couple of `.st-` (snapshot-tree) classes if the existing `.ot-` classes don't fit perfectly

## Verification

1. `pnpm run build`
2. Load extension, navigate to a page, type `snapshot` in console
3. Verify tree renders with collapsible nodes
4. Verify Copy button still copies the original YAML text
5. Verify `export` command still renders as `<pre>` code block (not tree)
6. Run component tests: `pnpm --filter @playwright-repl/extension run test`
7. Run E2E tests: `pnpm --filter @playwright-repl/extension run test:e2e`
