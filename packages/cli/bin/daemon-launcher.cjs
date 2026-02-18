#!/usr/bin/env node

/**
 * Daemon launcher — replaces @playwright/cli entirely.
 * Same pattern, pointing to our own package.json for the socket hash.
 */

const { program } = require('playwright/lib/mcp/terminal/program');
const packageLocation = require.resolve('../package.json');
program(packageLocation).catch(e => {
  console.error(e.message);
  process.exit(1);
});
