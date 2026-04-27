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
import { SessionPlayer } from './recorder.js';
import fs from 'node:fs';
import http from 'node:http';

const args = minimist(process.argv.slice(2), {
  boolean: ['headed', 'headless', 'bridge', 'http', 'interactive', 'help'],
  string: ['http-port', 'bridge-port', 'command', 'replay', 'variable', 'load'],
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

// --load: load .js file as a global function definition in the service worker
if (args.load) {
  const httpPort = args['http-port'] ? parseInt(args['http-port'] as string, 10) : 9223;
  const filename = args.load as string;
  if (!fs.existsSync(filename)) { console.error(`File not found: ${filename}`); process.exit(1); }
  const script = fs.readFileSync(filename, 'utf-8');
  const result = await new Promise<{ text?: string; isError?: boolean }>((resolve, reject) => {
    const body = JSON.stringify({ command: script });
    const req = http.request({ hostname: '127.0.0.1', port: httpPort, path: '/run', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid response')); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  }).catch((e: Error) => ({ text: e.message, isError: true }));
  if (result.isError) { console.error(result.text); process.exit(1); }
  console.log(`✓ Loaded ${filename}`);
  process.exit(0);
}

// --replay: load .pw file, substitute variables, send commands via HTTP
if (args.replay) {
  const httpPort = args['http-port'] ? parseInt(args['http-port'] as string, 10) : 9223;
  // Parse --variable args (string or string[])
  const variables: Record<string, string> = {};
  const varArgs = args.variable ? (Array.isArray(args.variable) ? args.variable : [args.variable]) as string[] : [];
  for (const v of varArgs) {
    const [key, ...rest] = v.split('=');
    if (key && rest.length > 0) variables[key] = rest.join('=');
  }
  const commands = SessionPlayer.load(args.replay as string, Object.keys(variables).length > 0 ? variables : undefined);

  let failed = false;
  for (const cmd of commands) {
    const result = await new Promise<{ text?: string; isError?: boolean }>((resolve, reject) => {
      const body = JSON.stringify({ command: cmd });
      const req = http.request({ hostname: '127.0.0.1', port: httpPort, path: '/run', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid response')); } });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    }).catch((e: Error) => ({ text: e.message, isError: true }));

    const mark = result.isError ? '✗' : '✓';
    console.log(`${mark} ${cmd}${result.isError && result.text ? ` — ${result.text}` : ''}`);
    if (result.isError) { failed = true; break; }
  }
  process.exit(failed ? 1 : 0);
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
    interactive: args.interactive as boolean,
    headed: args.headless ? false : args.headed ? true : undefined,
  }).catch((err: Error) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
