/**
 * Shared dependencies and command vocabulary.
 * No @playwright/cli — we start the daemon ourselves via daemon-launcher.cjs.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ─── Own dependencies ────────────────────────────────────────────────────────

export const minimist = require('minimist');

const pkgUrl = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgUrl, 'utf-8'));
export const replVersion = pkg.version;

// Must match what daemon-launcher.cjs computes via require.resolve('../package.json')
export const packageLocation = fileURLToPath(pkgUrl);

// ─── Command vocabulary ──────────────────────────────────────────────────────

export const COMMANDS = {
  'open':              { desc: 'Open the browser', options: [] },
  'close':             { desc: 'Close the browser', options: [] },
  'goto':              { desc: 'Navigate to a URL', options: [] },
  'go-back':           { desc: 'Go back', options: [] },
  'go-forward':        { desc: 'Go forward', options: [] },
  'reload':            { desc: 'Reload page', options: [] },
  'click':             { desc: 'Click an element', options: ['--button', '--modifiers'] },
  'dblclick':          { desc: 'Double-click', options: ['--button', '--modifiers'] },
  'fill':              { desc: 'Fill a form field', options: ['--submit'] },
  'type':              { desc: 'Type text key by key', options: ['--submit'] },
  'press':             { desc: 'Press a keyboard key', options: [] },
  'hover':             { desc: 'Hover over element', options: [] },
  'select':            { desc: 'Select dropdown option', options: [] },
  'check':             { desc: 'Check a checkbox', options: [] },
  'uncheck':           { desc: 'Uncheck a checkbox', options: [] },
  'upload':            { desc: 'Upload a file', options: [] },
  'drag':              { desc: 'Drag and drop', options: [] },
  'snapshot':          { desc: 'Accessibility snapshot', options: ['--filename'] },
  'screenshot':        { desc: 'Take a screenshot', options: ['--filename', '--fullPage'] },
  'eval':              { desc: 'Evaluate JavaScript', options: [] },
  'console':           { desc: 'Console messages', options: ['--clear'] },
  'network':           { desc: 'Network requests', options: ['--clear', '--includeStatic'] },
  'run-code':          { desc: 'Run Playwright code', options: [] },
  'tab-list':          { desc: 'List tabs', options: [] },
  'tab-new':           { desc: 'New tab', options: [] },
  'tab-close':         { desc: 'Close tab', options: [] },
  'tab-select':        { desc: 'Select tab', options: [] },
  'cookie-list':       { desc: 'List cookies', options: [] },
  'cookie-get':        { desc: 'Get cookie', options: [] },
  'cookie-set':        { desc: 'Set cookie', options: [] },
  'cookie-delete':     { desc: 'Delete cookie', options: [] },
  'cookie-clear':      { desc: 'Clear cookies', options: [] },
  'localstorage-list':    { desc: 'List localStorage', options: [] },
  'localstorage-get':     { desc: 'Get localStorage', options: [] },
  'localstorage-set':     { desc: 'Set localStorage', options: [] },
  'localstorage-delete':  { desc: 'Delete localStorage', options: [] },
  'localstorage-clear':   { desc: 'Clear localStorage', options: [] },
  'sessionstorage-list':  { desc: 'List sessionStorage', options: [] },
  'sessionstorage-get':   { desc: 'Get sessionStorage', options: [] },
  'sessionstorage-set':   { desc: 'Set sessionStorage', options: [] },
  'sessionstorage-delete':{ desc: 'Delete sessionStorage', options: [] },
  'sessionstorage-clear': { desc: 'Clear sessionStorage', options: [] },
  'state-save':        { desc: 'Save storage state', options: ['--filename'] },
  'state-load':        { desc: 'Load storage state', options: [] },
  'dialog-accept':     { desc: 'Accept dialog', options: [] },
  'dialog-dismiss':    { desc: 'Dismiss dialog', options: [] },
  'route':             { desc: 'Add network route', options: [] },
  'route-list':        { desc: 'List routes', options: [] },
  'unroute':           { desc: 'Remove route', options: [] },
  'resize':            { desc: 'Resize window', options: [] },
  'pdf':               { desc: 'Save as PDF', options: ['--filename'] },
  'config-print':      { desc: 'Print config', options: [] },
  'install-browser':   { desc: 'Install browser', options: [] },
  'list':              { desc: 'List sessions', options: [] },
  'close-all':         { desc: 'Close all sessions', options: [] },
  'kill-all':          { desc: 'Kill all daemons', options: [] },
};
