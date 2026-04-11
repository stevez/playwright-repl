#!/usr/bin/env node

/**
 * pw-cli — shorthand for playwright-repl --http --command.
 *
 * Usage:
 *   pw-cli "snapshot"           # → --http --command "snapshot"
 *   pw-cli "click e5"           # → --http --command "click e5"
 *   pw-cli                      # → starts interactive REPL (same as playwright-repl)
 *   pw-cli --bridge             # → passes flags through to playwright-repl
 */

import { startRepl } from './repl.js';
import { minimist } from '@playwright-repl/core';

const args = minimist(process.argv.slice(2), {
  boolean: ['headed', 'headless', 'bridge', 'http', 'help'],
  string: ['http-port', 'bridge-port', 'command'],
  alias: { h: 'help' },
});

if (args.help) {
  console.log(`
pw-cli — shorthand for playwright-repl

Usage:
  pw-cli "snapshot"              # send command via HTTP (fast)
  pw-cli "click e5"              # send command via HTTP
  pw-cli                         # start interactive REPL
  pw-cli --bridge                # start bridge mode REPL
  pw-cli --http                  # start REPL with HTTP server

Examples:
  pw-cli "goto https://example.com"
  pw-cli "await page.title()"
  pw-cli "screenshot"
`);
  process.exit(0);
}

// If positional args given, treat as --http --command
const positional = args._ as string[];
if (positional.length > 0) {
  const command = positional.join(' ');
  startRepl({
    command,
    http: true,
    httpPort: args['http-port'] ? parseInt(args['http-port'] as string, 10) : undefined,
    silent: true,
  }).catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  // No args — start interactive REPL, pass through flags
  startRepl({
    bridge: args.bridge as boolean,
    http: args.http as boolean,
    httpPort: args['http-port'] ? parseInt(args['http-port'] as string, 10) : undefined,
    bridgePort: args['bridge-port'] ? parseInt(args['bridge-port'] as string, 10) : undefined,
    headed: args.headless ? false : args.headed ? true : undefined,
  }).catch((err: Error) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
