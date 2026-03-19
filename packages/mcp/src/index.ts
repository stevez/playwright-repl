#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BridgeServer, COMMANDS, CATEGORIES, refToLocator } from '@playwright-repl/core';

const argv = process.argv.slice(2);
const portIdx = argv.indexOf('--port');
const port = portIdx !== -1
    ? parseInt(argv[portIdx + 1])
    : (process.env.BRIDGE_PORT ? parseInt(process.env.BRIDGE_PORT) : 9876);

const srv = new BridgeServer();
let lastSnapshot: { url: string; snapshotString: string } | null = null;
try {
    await srv.start(port);
} catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
        console.error(`Error: port ${port} is already in use. Another playwright-repl bridge or MCP inspector may be running. Stop it and restart Claude Desktop.`);
        process.exit(1);
    }
    throw err;
}
console.error(`playwright-repl bridge listening on ws://localhost:${port}`);

srv.onConnect(() => console.error('Extension connected'));
srv.onDisconnect(() => console.error('Extension disconnected'));

const RUN_COMMAND_INPUT_DESCRIPTION = `\
A keyword command ('snapshot', 'goto https://example.com', 'click Submit', \
'fill "Email" user@example.com'), a Playwright expression \
('await page.url()'), or a JavaScript expression ('document.title')`;

const RUN_COMMAND_DESCRIPTION = `\
Run a command in the connected Chrome browser. Supports three input modes:

1. KEYWORD (.pw) — playwright-repl commands:
   snapshot, goto <url>, click <text>, fill <label> <value>, press <key>,
   verify-text <text>, verify-no-text <text>, screenshot, scroll-down,
   check <label>, select <label> <value>, localstorage-list, localstorage-clear

2. PLAYWRIGHT — Playwright API (page.* / crxApp.*):
   await page.url(), await page.title(),
   await page.locator('button').count()

3. JAVASCRIPT — any JS expression evaluated in the browser:
   document.title, window.location.href,
   document.querySelectorAll('a').length

Use snapshot to understand the page structure before interacting. Use screenshot to visually verify the current state.

IMPORTANT: Before writing .pw commands, run 'help' to get the full list of available commands. Only use commands that appear in the help output. Do not invent commands.`;

const server = new McpServer({ name: 'playwright-repl', version: '0.12.0' });

server.registerTool(
    'run_command',
    {
        description: RUN_COMMAND_DESCRIPTION,
        inputSchema: {
            command: z.string().describe(RUN_COMMAND_INPUT_DESCRIPTION),
        },
    },
    async ({ command }) => {
        const trimmed = command.trim().toLowerCase();
        if (trimmed === 'help') {
            const lines = Object.entries(CATEGORIES)
                .map(([cat, cmds]) => `  ${cat}: ${cmds.join(', ')}`)
                .join('\n');
            return { content: [{ type: 'text' as const, text: `Available commands:\n${lines}\n\nType "help <command>" for details.` }] };
        }
        if (trimmed.startsWith('locator ')) {
            const ref = command.trim().slice(8).trim();
            if (!lastSnapshot) {
                return { content: [{ type: 'text' as const, text: 'No snapshot cached. Run "snapshot" first.' }], isError: true };
            }
            const locator = refToLocator(lastSnapshot.snapshotString, ref);
            if (!locator) {
                return { content: [{ type: 'text' as const, text: `Ref "${ref}" not found in last snapshot. Run "snapshot" to refresh.` }], isError: true };
            }
            return { content: [{ type: 'text' as const, text: `js: ${locator.js}\npw: ${locator.pw}` }] };
        }
        if (trimmed.startsWith('help ')) {
            const cmd = trimmed.slice(5).trim();
            const info = COMMANDS[cmd];
            if (!info) {
                return { content: [{ type: 'text' as const, text: `Unknown command: "${cmd}". Type "help" for available commands.` }], isError: true };
            }
            const parts = [`${cmd} — ${info.desc}`];
            if (info.usage) parts.push(`Usage: ${info.usage}`);
            if (info.examples?.length) {
                parts.push('Examples:');
                for (const ex of info.examples) parts.push(`  ${ex}`);
            }
            return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
        }
        if (!srv.connected) {
            return {
                content: [{ type: 'text' as const, text: 'Browser not connected. Open Chrome with the playwright-repl extension — it connects automatically.' }],
                isError: true,
            };
        }
        const result = await srv.run(command);
        // Cache snapshot for locator command
        // Bridge mode: snapshot returns raw YAML (no ### headers)
        if (trimmed.startsWith('snapshot') && result.text && !result.isError) {
            lastSnapshot = { url: '', snapshotString: result.text.trim() };
        }
        if (result.image) {
            const [header, data] = result.image.split(',');
            const mimeType = (header.match(/data:(.*);base64/) ?? [])[1] ?? 'image/png';
            return { content: [{ type: 'image' as const, data, mimeType }] };
        }
        return {
            content: [{ type: 'text' as const, text: result.text || 'Done' }],
            isError: result.isError,
        };
    }
);

const RUN_SCRIPT_DESCRIPTION = `\
Run a multi-line script, returning combined pass/fail results.
Useful for replaying a known script without per-step round trips.
Prefer run_command for AI-driven exploration where you need to observe and adapt after each step.

language='pw': each line is a .pw keyword command, run sequentially. Lines starting with # are skipped. Stops on first error.
language='javascript': the entire script is run as a single JavaScript/Playwright block.

IMPORTANT: Only use commands listed by 'help'. Run run_command('help') first if unsure which commands are available.`;

server.registerTool(
    'run_script',
    {
        description: RUN_SCRIPT_DESCRIPTION,
        inputSchema: {
            script: z.string().describe('The script to execute'),
            language: z.enum(['pw', 'javascript']).describe("'pw' for keyword commands (one per line), 'javascript' for a JS/Playwright block"),
        },
    },
    async ({ script, language }) => {
        if (!srv.connected) {
            return {
                content: [{ type: 'text' as const, text: 'Browser not connected. Open Chrome with the playwright-repl extension — it connects automatically.' }],
                isError: true,
            };
        }
        const result = await srv.runScript(script, language);
        return {
            content: [{ type: 'text' as const, text: result.text || 'Done' }],
            isError: result.isError,
        };
    }
);

const GENERATE_TEST_PROMPT = (steps: string, url?: string) => `\
Generate a passing Playwright test for the following scenario:
${steps}

Workflow:
0. Run run_command('help') to see all available keyword commands. Only use commands from this list — do not invent commands.
1. ${url ? `Navigate to ${url} using run_command('goto ${url}').` : 'Navigate to the target URL using run_command.'}
2. Take a snapshot using run_command('snapshot') to understand the page structure.
3. Interact with the page as needed (click, fill, press) using run_command.
4. After each interaction, take another snapshot to verify the state before asserting.
5. Write assertions using \`expect\`.

Example pattern:
  await page.goto('https://example.com');
  await expect(page).toHaveTitle('Example', { exact: true });
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await page.getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();

Code constraints:
- Use only \`page\` and \`expect\` — available as globals, do NOT import them
- Plain \`await\` statements only — no \`import\`, no \`test()\` wrapper, no \`describe()\`
- Use \`exact: true\` when a locator text might match multiple elements

Once you have the code, run it with run_script(language="javascript").
If any assertion fails, read the error, fix the code, and run again until all pass.
Show the final passing code.`;

server.registerPrompt(
  'generate-test',
  {
    description: 'Generate a passing Playwright test from a described scenario',
    argsSchema: {
      steps: z.string().describe('Describe the test scenario, e.g. "log in with email/password, verify the dashboard loads"'),
      url: z.string().optional().describe('URL to navigate to first (optional)'),
    },
  },
  ({ steps, url }) => ({
    messages: [{
      role: 'user' as const,
      content: { type: 'text' as const, text: GENERATE_TEST_PROMPT(steps, url) },
    }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);