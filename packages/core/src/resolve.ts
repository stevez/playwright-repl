/**
 * Shared dependencies and command vocabulary.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ─── Own dependencies ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const minimist: (args: string[], opts?: Record<string, unknown>) => Record<string, unknown> & { _: string[] } = require('minimist');

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const replVersion: string = require('../package.json').version;

// ─── Command vocabulary ──────────────────────────────────────────────────────

export interface CommandInfo {
  desc: string;
  options: string[];
  usage?: string;
  examples?: string[];
}

export const COMMANDS: Record<string, CommandInfo> = {
  'open':              { desc: 'Open the browser', options: [] },
  'close':             { desc: 'Close the browser', options: [] },
  'goto':              { desc: 'Navigate to a URL', options: [],
                         usage: 'goto <url>',
                         examples: ['goto https://example.com'] },
  'go-back':           { desc: 'Go back', options: [] },
  'go-forward':        { desc: 'Go forward', options: [] },
  'reload':            { desc: 'Reload page', options: [] },
  'click':             { desc: 'Click an element', options: ['--button', '--modifiers'],
                         usage: 'click <text> | click <ref>',
                         examples: ['click "Submit"', 'click e5', 'click "Submit" --button right'] },
  'dblclick':          { desc: 'Double-click', options: ['--button', '--modifiers'],
                         usage: 'dblclick <text> | dblclick <ref>' },
  'fill':              { desc: 'Fill a form field', options: ['--submit'],
                         usage: 'fill <text|ref> <value>',
                         examples: ['fill "Email" "user@test.com"', 'fill e3 "hello"', 'fill "Search" "query" --submit'] },
  'type':              { desc: 'Type text key by key', options: ['--submit'],
                         usage: 'type <text>',
                         examples: ['type "hello world"'] },
  'press':             { desc: 'Press a keyboard key', options: [],
                         usage: 'press <key> | press <ref> <key>',
                         examples: ['press Enter', 'press e5 Tab'] },
  'hover':             { desc: 'Hover over element', options: [],
                         usage: 'hover <text> | hover <ref>' },
  'select':            { desc: 'Select dropdown option', options: [],
                         usage: 'select <text|ref> <value>',
                         examples: ['select "Country" "US"'] },
  'check':             { desc: 'Check a checkbox', options: [],
                         usage: 'check <text> | check <ref>' },
  'uncheck':           { desc: 'Uncheck a checkbox', options: [],
                         usage: 'uncheck <text> | uncheck <ref>' },
  'upload':            { desc: 'Upload a file', options: [],
                         usage: 'upload <ref> <filepath>' },
  'drag':              { desc: 'Drag and drop', options: [],
                         usage: 'drag <source> <target>' },
  'snapshot':          { desc: 'Accessibility snapshot', options: ['--filename'],
                         usage: 'snapshot [--filename <file>]' },
  'screenshot':        { desc: 'Take a screenshot', options: ['--filename', '--fullPage'],
                         usage: 'screenshot [--filename <file>] [--fullPage]' },
  'eval':              { desc: 'Evaluate JavaScript', options: [],
                         usage: 'eval <expression>',
                         examples: ['eval document.title', 'eval document.querySelectorAll("a").length'] },
  'console':           { desc: 'Console messages', options: ['--clear'],
                         usage: 'console [--clear]' },
  'network':           { desc: 'Network requests', options: ['--clear', '--static'],
                         usage: 'network [--clear] [--static]' },
  'run-code':          { desc: 'Run Playwright code', options: [],
                         usage: 'run-code <code>',
                         examples: ['run-code await page.goto("https://example.com")'] },
  'tab-list':          { desc: 'List tabs', options: [] },
  'tab-new':           { desc: 'New tab', options: [],
                         usage: 'tab-new [url]',
                         examples: ['tab-new', 'tab-new https://example.com'] },
  'tab-close':         { desc: 'Close tab', options: [],
                         usage: 'tab-close [index]' },
  'tab-select':        { desc: 'Select tab', options: [],
                         usage: 'tab-select <index>',
                         examples: ['tab-select 0'] },
  'cookie-list':       { desc: 'List cookies', options: [] },
  'cookie-get':        { desc: 'Get cookie', options: [],
                         usage: 'cookie-get <name>' },
  'cookie-set':        { desc: 'Set cookie', options: [],
                         usage: 'cookie-set <name> <value>' },
  'cookie-delete':     { desc: 'Delete cookie', options: [],
                         usage: 'cookie-delete <name>' },
  'cookie-clear':      { desc: 'Clear cookies', options: [] },
  'localstorage-list':    { desc: 'List localStorage', options: [] },
  'localstorage-get':     { desc: 'Get localStorage', options: [],
                            usage: 'localstorage-get <key>' },
  'localstorage-set':     { desc: 'Set localStorage', options: [],
                            usage: 'localstorage-set <key> <value>' },
  'localstorage-delete':  { desc: 'Delete localStorage', options: [],
                            usage: 'localstorage-delete <key>' },
  'localstorage-clear':   { desc: 'Clear localStorage', options: [] },
  'sessionstorage-list':  { desc: 'List sessionStorage', options: [] },
  'sessionstorage-get':   { desc: 'Get sessionStorage', options: [],
                            usage: 'sessionstorage-get <key>' },
  'sessionstorage-set':   { desc: 'Set sessionStorage', options: [],
                            usage: 'sessionstorage-set <key> <value>' },
  'sessionstorage-delete':{ desc: 'Delete sessionStorage', options: [],
                            usage: 'sessionstorage-delete <key>' },
  'sessionstorage-clear': { desc: 'Clear sessionStorage', options: [] },
  'state-save':        { desc: 'Save storage state', options: ['--filename'],
                         usage: 'state-save [--filename <file>]' },
  'state-load':        { desc: 'Load storage state', options: [] },
  'dialog-accept':     { desc: 'Accept dialog', options: [] },
  'dialog-dismiss':    { desc: 'Dismiss dialog', options: [] },
  'route':             { desc: 'Add network route', options: [] },
  'route-list':        { desc: 'List routes', options: [] },
  'unroute':           { desc: 'Remove route', options: [] },
  'resize':            { desc: 'Resize window', options: [],
                         usage: 'resize <width> <height>' },
  'pdf':               { desc: 'Save as PDF', options: ['--filename'],
                         usage: 'pdf [--filename <file>]' },
  'config-print':      { desc: 'Print config', options: [] },
  'verify':            { desc: 'Assert page state', options: [],
                         usage: 'verify <sub> <args>',
                         examples: ['verify title "Example"', 'verify url "/dashboard"'] },
  'verify-text':       { desc: 'Assert text is visible', options: [],
                         usage: 'verify-text <text>',
                         examples: ['verify-text "Welcome"'] },
  'verify-no-text':    { desc: 'Assert text is not visible', options: [],
                         usage: 'verify-no-text <text>' },
  'verify-element':    { desc: 'Assert element exists by role and name', options: [],
                         usage: 'verify-element <role> <name>',
                         examples: ['verify-element button "Submit"', 'verify-element heading "Dashboard"'] },
  'verify-no-element': { desc: 'Assert element does not exist', options: [],
                         usage: 'verify-no-element <role> <name>' },
  'verify-value':      { desc: 'Assert input value', options: [],
                         usage: 'verify-value <ref> <expected>',
                         examples: ['verify-value e3 "hello"'] },
  'verify-visible':    { desc: 'Assert element is visible', options: [],
                         usage: 'verify-visible <role> <name>',
                         examples: ['verify-visible button "Submit"'] },
  'verify-input-value':{ desc: 'Assert input value by label', options: [],
                         usage: 'verify-input-value <label> <expected>',
                         examples: ['verify-input-value "Email" "user@test.com"'] },
  'verify-list':       { desc: 'Assert list contains items', options: [],
                         usage: 'verify-list <role> <name> <items...>' },
  'verify-title':      { desc: 'Assert page title', options: [],
                         usage: 'verify-title <text>' },
  'verify-url':        { desc: 'Assert page URL', options: [],
                         usage: 'verify-url <text>' },
  'wait-for-text':     { desc: 'Wait until text appears', options: [],
                         usage: 'wait-for-text <text>',
                         examples: ['wait-for-text "Loading complete"'] },
  'highlight':         { desc: 'Highlight an element', options: [],
                         usage: 'highlight <text> | highlight <ref>' },
  'locator':           { desc: 'Generate Playwright locator for a ref', options: [],
                         usage: 'locator <ref>',
                         examples: ['locator e5'] },
  'install-browser':   { desc: 'Install browser', options: [] },
  'list':              { desc: 'List sessions', options: [] },
  'close-all':         { desc: 'Close all sessions', options: [] },
  'kill-all':          { desc: 'Kill all daemons', options: [] },
};

export const CATEGORIES: Record<string, string[]> = {
  'Navigation':     ['goto', 'open', 'go-back', 'go-forward', 'reload'],
  'Interaction':    ['click', 'dblclick', 'fill', 'type', 'press', 'hover', 'select', 'check', 'uncheck', 'drag'],
  'Inspection':     ['snapshot', 'locator', 'screenshot', 'eval', 'console', 'network', 'run-code', 'highlight'],
  'Assertions':     ['verify', 'verify-text', 'verify-no-text', 'verify-element', 'verify-no-element', 'verify-value', 'verify-visible', 'verify-input-value', 'verify-list', 'verify-title', 'verify-url', 'wait-for-text'],
  'Tabs':           ['tab-list', 'tab-new', 'tab-close', 'tab-select'],
  'Cookies':        ['cookie-list', 'cookie-get', 'cookie-set', 'cookie-delete', 'cookie-clear'],
  'LocalStorage':   ['localstorage-list', 'localstorage-get', 'localstorage-set', 'localstorage-delete', 'localstorage-clear'],
  'SessionStorage': ['sessionstorage-list', 'sessionstorage-get', 'sessionstorage-set', 'sessionstorage-delete', 'sessionstorage-clear'],
  'State':          ['state-save', 'state-load'],
  'Other':          ['dialog-accept', 'dialog-dismiss', 'route', 'route-list', 'unroute', 'resize', 'pdf', 'upload', 'config-print'],
};

/** Commands that mutate the page — snapshot should be attached when includeSnapshot is on. */
export const UPDATE_COMMANDS = new Set([
  // Navigation
  'goto', 'go-back', 'go-forward', 'reload',
  // Interaction
  'click', 'dblclick', 'fill', 'type', 'press', 'hover', 'select', 'check', 'uncheck', 'drag', 'upload',
  // Wait
  'wait-for-text',
]);

export const JS_CATEGORIES: Record<string, string[]> = {
  'Navigation':   ['page.goto(url)', 'page.goBack()', 'page.reload()', '...'],
  'Locators':     ['page.getByRole(role)', 'page.getByText(text)', 'page.locator(sel)', 'page.getByTestId(id)', '...'],
  'Actions':      ['.click()', '.fill(value)', '.press(key)', '.hover()', '.selectOption(value)', '...'],
  'Query':        ['.textContent()', '.getAttribute(name)', '.isVisible()', '.count()', '...'],
  'Assertions':   ['expect(loc).toBeVisible()', '.toHaveText()', '.toHaveValue()', 'expect(page).toHaveTitle()', '.toHaveURL()', '...'],
  'Wait':         ['page.waitForSelector(sel)', 'page.waitForLoadState()', 'page.waitForURL(url)'],
  'Evaluate':     ['page.evaluate(() => expr)'],
  'Other':        ['page.screenshot()', 'page.keyboard.press(key)', 'page.mouse.click(x, y)', '...'],
};
