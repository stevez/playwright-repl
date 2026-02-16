#!/usr/bin/env node

/**
 * playwright-repl MCP server entrypoint.
 */

import { runMcpServer } from '../src/mcp-server.mjs';

runMcpServer().catch((error) => {
  console.error(`Fatal: ${error?.message || String(error)}`);
  process.exit(1);
});
