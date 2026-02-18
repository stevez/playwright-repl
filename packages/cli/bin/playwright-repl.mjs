#!/usr/bin/env node

/**
 * playwright-repl CLI entry point.
 *
 * Usage:
 *   playwright-repl [options]
 *   playwright-repl --replay session.pw
 *   playwright-repl --replay session.pw --step
 *   playwright-repl --record my-test.pw
 */

import { minimist } from '@playwright-repl/core';
import { startRepl } from '../src/repl.mjs';

const args = minimist(process.argv.slice(2), {
  boolean: ['headed', 'persistent', 'extension', 'help', 'step', 'silent'],
  string: ['session', 'browser', 'profile', 'config', 'replay', 'record', 'connect'],
  alias: { s: 'session', h: 'help', b: 'browser', q: 'silent' },
  default: { session: 'default' },
});

// --connect without a value → default port 9222
if (args.connect === '') args.connect = 9222;
else if (args.connect) args.connect = parseInt(args.connect, 10) || 9222;

if (args.help) {
  console.log(`
playwright-repl - Interactive REPL for Playwright browser automation

Usage:
  playwright-repl [options]

Options:
  -s, --session <name>   Session name (default: "default")
  -b, --browser <type>   Browser: chrome, firefox, webkit, msedge
  --headed               Run browser in headed mode
  --persistent           Use persistent browser profile
  --profile <dir>        Persistent profile directory
  --connect [port]       Connect to existing Chrome via CDP (default: 9222)
  --config <file>        Path to config file
  --replay <file>        Replay a .pw session file
  --record <file>        Start REPL with recording to file
  --step                 Pause between commands during replay
  -q, --silent           Suppress banner and status messages
  -h, --help             Show this help

REPL Meta-Commands:
  .help                  Show available commands
  .aliases               Show command aliases
  .status                Show connection status
  .reconnect             Restart browser
  .record [filename]     Start recording commands
  .save                  Stop recording and save to file
  .pause                 Pause/resume recording
  .discard               Discard current recording
  .replay <filename>     Replay a recorded session
  .exit / Ctrl+D         Exit REPL

Examples:
  playwright-repl                        # start REPL
  playwright-repl --headed               # start with visible browser
  playwright-repl --connect              # connect to Chrome on port 9222
  playwright-repl --connect 9333         # connect to Chrome on custom port
  playwright-repl --replay login.pw      # replay a session
  playwright-repl --replay login.pw --step  # step through replay
  echo "open https://example.com" | playwright-repl  # pipe commands
`);
  process.exit(0);
}

startRepl({
  session: args.session,
  headed: args.headed,
  browser: args.browser,
  persistent: args.persistent,
  profile: args.profile,
  connect: args.connect,
  config: args.config,
  replay: args.replay,
  record: args.record,
  step: args.step,
  silent: args.silent,
}).catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
