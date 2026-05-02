# @playwright-repl/core

Shared parser, relay server, and utilities for the playwright-repl ecosystem.

Used by [`playwright-repl`](../cli/README.md) (CLI), [`@playwright-repl/runner`](../runner/README.md) (runner), [`@playwright-repl/mcp`](../mcp/README.md) (MCP server), and the [VS Code extension](../vscode/README.md).

## Install

```bash
npm install @playwright-repl/core
```

## Key Exports

### `CDPRelayServer`

CDP relay server for connecting Node.js (Playwright) to an existing Chrome with the Dramaturg extension. Used by CLI `--connect` mode and MCP relay mode.

```typescript
import { CDPRelayServer } from '@playwright-repl/core';

const relay = new CDPRelayServer();
await relay.start(9877);
console.log(relay.cdpEndpoint());     // ws://localhost:...
console.log(relay.relayEndpoint());   // ws://localhost:...
```

### `resolveCommand`

Resolve a keyword command to a Playwright JS expression.

```typescript
import { resolveCommand } from '@playwright-repl/core';

const resolved = resolveCommand('click "Submit"');
// → { jsExpr: 'await page.getByText("Submit").click()' }
```

### `parseInput`

Parse a raw command string into `ParsedArgs`.

```typescript
import { parseInput } from '@playwright-repl/core';

parseInput('click "Submit"');
// → { _: ['click', 'Submit'] }
```

---

## Types

```typescript
interface EngineResult {
  text?: string;     // Text output (accessibility tree, command result, error)
  image?: string;    // Base64 data URL (screenshot commands)
  isError?: boolean;
}

interface ParsedArgs {
  _: string[];       // Positional arguments
  [key: string]: unknown;  // Named flags
}
```

## File Structure

```
src/
├── cdp-relay-server.ts    # CDP relay server (CDPRelayServer)
├── parser.ts              # Command parsing, alias resolution, resolveArgs
├── resolve-command.ts     # Keyword → JS expression resolution
├── page-scripts.ts        # Text locators + assertion helpers
├── completion-data.ts     # Autocomplete items for all commands
├── snapshot-parser.ts     # Snapshot tree parsing + ref-to-locator
├── filter.ts              # Response filtering
├── resolve.ts             # COMMANDS map, minimist re-export, version
├── colors.ts              # ANSI color helpers
├── types.ts               # Shared type definitions
└── index.ts               # Public exports
```
