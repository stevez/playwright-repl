# @playwright-repl/core

Shared parser, servers, and utilities for the playwright-repl ecosystem.

Used by [`playwright-repl`](../cli/README.md) (CLI), [`@playwright-repl/runner`](../runner/README.md) (runner), and [`@playwright-repl/mcp`](../mcp/README.md) (MCP server).

## Install

```bash
npm install @playwright-repl/core
```

## Key Exports

### `BridgeServer`

WebSocket server that the Dramaturg Chrome extension connects to. Used by the CLI (`--bridge`), MCP server, and `pw repl-extension`.

```typescript
import { BridgeServer } from '@playwright-repl/core';

const bridge = new BridgeServer();
await bridge.start(9876);  // default port

bridge.onConnect(() => console.log('Extension connected'));
bridge.onDisconnect(() => console.log('Extension disconnected'));

await bridge.waitForConnection();

const result = await bridge.run('snapshot');
console.log(result.text);

await bridge.close();
```

**Methods:**

| Method | Description |
|--------|-------------|
| `start(port?)` | Start WebSocket server (default port `9876`) |
| `run(command)` | Send a command to the extension, returns `EngineResult` |
| `runScript(script, language)` | Send a multi-line script (`'pw'` or `'javascript'`) |
| `waitForConnection(timeoutMs?)` | Wait until extension connects (default 30s) |
| `onConnect(fn)` | Callback when extension connects |
| `onDisconnect(fn)` | Callback when extension disconnects |
| `connected` | `boolean` — whether extension is connected |
| `close()` | Shut down the server |

---

### `CommandServer`

HTTP server for external command execution. Used by `--server` mode (AI agents) and extension mode.

**Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `POST /run` | Execute a command via `engine.run()` |
| `POST /select-tab` | Switch active page by URL |
| `GET /health` | Server status check |

---

### `parseInput`

Parse a raw command string into `ParsedArgs`.

```typescript
import { parseInput } from '@playwright-repl/core';

parseInput('click "Submit"');
// → { _: ['click', 'Submit'] }

parseInput('fill "Email" user@example.com');
// → { _: ['fill', 'Email', 'user@example.com'] }

parseInput('snapshot');
// → { _: ['snapshot'] }
```

Returns `null` for unrecognized commands.

---

### `buildCompletionItems`

Autocomplete data for all `.pw` commands, with descriptions and usage hints.

```typescript
import { buildCompletionItems } from '@playwright-repl/core';

const items = buildCompletionItems();
// → [{ label: 'goto', detail: 'Navigate to a URL', ... }, ...]
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
├── bridge-server.ts    # WebSocket bridge server (BridgeServer)
├── extension-server.ts # HTTP command server (CommandServer)
├── parser.ts           # Command parsing + alias resolution
├── page-scripts.ts     # Text locators + assertion helpers
├── completion-data.ts  # Autocomplete items for all commands
├── filter.ts           # Response filtering
├── resolve.ts          # COMMANDS map, minimist re-export, version
├── colors.ts           # ANSI color helpers
├── types.ts            # Shared type definitions
└── index.ts            # Public exports
```
