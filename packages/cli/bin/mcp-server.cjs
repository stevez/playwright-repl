#!/usr/bin/env node

/**
 * Thin MCP server entrypoint — uses Playwright's built-in MCP infrastructure.
 * Starts a stdio MCP server with all browser tools available.
 *
 * Uses only publicly exported paths:
 *   - playwright/lib/mcp/index        → createConnection()
 *   - playwright-core/lib/mcpBundle   → StdioServerTransport
 */

const { createConnection } = require('playwright/lib/mcp/index');
const { StdioServerTransport } = require('playwright-core/lib/mcpBundle');

// ─── Parse CLI args ───

const args = process.argv.slice(2);
const headed = args.includes('--headed');

(async () => {
  const server = await createConnection({
    browser: {
      launchOptions: { headless: !headed },
    },
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
