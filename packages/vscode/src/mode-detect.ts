/**
 * Mode Detection
 *
 * Scans a test file's source code to determine execution mode:
 * - 'browser': pure browser test → run in browser via shim (fastest, 0ms overhead)
 * - 'compiler': uses Node.js APIs → run in Node.js, page/expect → bridge (~2ms per call)
 *
 * Detection is per-file. If any Node.js API is detected, the entire file
 * uses compiler mode.
 */

const NODE_MODULES = [
  'fs', 'path', 'child_process', 'os', 'crypto', 'util',
  'stream', 'events', 'net', 'http', 'https', 'url',
  'worker_threads', 'cluster', 'dgram', 'dns', 'tls',
  'readline', 'zlib', 'buffer', 'assert',
];

// Build regex patterns for imports
const importPatterns = NODE_MODULES.flatMap(mod => [
  new RegExp(`from\\s+['"]${mod}['"]`),           // import x from 'fs'
  new RegExp(`from\\s+['"]node:${mod}['"]`),       // import x from 'node:fs'
  new RegExp(`require\\s*\\(\\s*['"]${mod}['"]`),   // require('fs')
  new RegExp(`require\\s*\\(\\s*['"]node:${mod}['"]`), // require('node:fs')
]);

const otherPatterns = [
  /process\.env\b/,           // process.env.VAR
  /process\.cwd\b/,           // process.cwd()
  /process\.argv\b/,          // process.argv
  /process\.exit\b/,          // process.exit()
  /__dirname\b/,              // __dirname
  /__filename\b/,             // __filename
];

export type TestMode = 'browser' | 'compiler';

export function detectTestMode(source: string): TestMode {
  for (const pattern of importPatterns) {
    if (pattern.test(source)) return 'compiler';
  }
  for (const pattern of otherPatterns) {
    if (pattern.test(source)) return 'compiler';
  }
  return 'browser';
}
