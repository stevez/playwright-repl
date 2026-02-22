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
import { startRepl } from './repl.js';

const args = minimist(process.argv.slice(2), {
  boolean: ['headed', 'persistent', 'extension', 'help', 'step', 'silent', 'spawn'],
  string: ['session', 'browser', 'profile', 'config', 'replay', 'record', 'connect', 'port', 'cdp-port'],
  alias: { s: 'session', h: 'help', b: 'browser', q: 'silent' },
  default: { session: 'default' },
});

// --connect without a value → default port 9222
if (args.connect === '') args.connect = 9222;
else if (args.connect) args.connect = parseInt(args.connect as string, 10) || 9222;

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
  --extension            Connect to Chrome with side panel extension
  --spawn                Spawn Chrome automatically (default: connect to existing)
  --port <number>        Extension server port (default: 6781)
  --cdp-port <number>    Chrome CDP port (default: 9222)
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
  playwright-repl --extension            # connect to existing Chrome + side panel
  playwright-repl --extension --spawn    # spawn Chrome automatically
  playwright-repl --extension --port 7000  # custom server port
  playwright-repl --extension --cdp-port 9333  # custom CDP port
  playwright-repl --replay login.pw      # replay a session
  playwright-repl --replay login.pw --step  # step through replay
  echo "open https://example.com" | playwright-repl  # pipe commands
`);
  process.exit(0);
}

startRepl({
  session: args.session as string,
  headed: args.headed as boolean,
  browser: args.browser as string,
  persistent: args.persistent as boolean,
  profile: args.profile as string,
  connect: args.connect as number | undefined,
  extension: args.extension as boolean,
  spawn: args.spawn === true,
  port: args.port ? parseInt(args.port as string, 10) : undefined,
  cdpPort: args['cdp-port'] ? parseInt(args['cdp-port'] as string, 10) : undefined,
  config: args.config as string,
  replay: args.replay as string,
  record: args.record as string,
  step: args.step as boolean,
  silent: args.silent as boolean,
}).catch((err: Error) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
