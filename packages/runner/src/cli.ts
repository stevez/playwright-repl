#!/usr/bin/env node
/**
 * pw CLI
 *
 * Drop-in replacement for `npx playwright test` with 50x faster bridge execution.
 *
 * Usage:
 *   pw test [options] [test-filter...]
 *   pw test --grep "login"
 *   pw test --headed
 *   pw test --config playwright.config.ts
 */

import { run } from './runner.js';

const args = process.argv.slice(2);

// First arg should be "test"
if (args[0] !== 'test') {
  console.log(`
pw — Playwright test runner with 50x faster execution

Usage:
  pw test [options] [test-filter...]

Options:
  -c, --config <file>     Configuration file (default: playwright.config.ts)
  -g, --grep <pattern>    Only run tests matching this pattern
  --headed                Run with visible browser
  --workers <n>           Number of workers (default: 1)
  --timeout <ms>          Per-test timeout (default: 30000)
  --retries <n>           Retry failed tests
  --reporter <name>       Reporter: list, json (default: list)
  --help                  Show this help
`);
  process.exit(args[0] === '--help' ? 0 : 1);
}

// Parse options
const testArgs = args.slice(1); // remove "test"
run(testArgs).then(exitCode => {
  process.exit(exitCode);
}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
