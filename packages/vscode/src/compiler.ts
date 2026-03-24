/**
 * Compiler
 *
 * Transforms a test file for Node.js execution with bridge commands.
 * - `page.*` and `expect(page` lines → `bridge.run("...")`
 * - Everything else stays as Node.js code
 * - Uses esbuild to compile TS → JS first
 *
 * Phase 1: handles pure string literal arguments (no variable extraction)
 * Phase 2: extracts Node.js variables and serializes them
 * Phase 3: handles return values from page methods
 */

import path from 'node:path';

// __filename is available at runtime in esbuild's CJS output
declare const __filename: string;

/**
 * Compile a test file for Node.js + bridge execution.
 * Returns JS code that runs in Node.js with bridge.run() calls for browser operations.
 */
export async function compileTestFile(testFilePath: string): Promise<string> {
  const esbuild = await import('esbuild');

  // Step 1: Compile TS → JS with esbuild (no bundling for Node.js modules)
  // But bundle the test file + its local imports, leave node_modules external
  const shimPath = path.resolve(path.dirname(__filename), '../src/shim/test-runner-node.ts');

  const result = await esbuild.build({
    entryPoints: [testFilePath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    alias: {
      '@playwright/test': shimPath,
    },
    external: [
      // Keep Node.js built-ins as imports (they run natively)
      'fs', 'path', 'child_process', 'os', 'crypto', 'util',
      'stream', 'events', 'net', 'http', 'https', 'url',
      'worker_threads', 'node:*',
    ],
  });

  const jsCode = result.outputFiles[0].text;

  // Step 2: Transform page.*/expect lines to bridge.run() calls
  return transformToBridgeCalls(jsCode);
}

/**
 * Transform browser lines to bridge.run() calls.
 *
 * Rules:
 * - Lines with `await page.` → wrap entire expression as bridge string
 * - Lines with `await expect(page` → wrap as bridge string
 * - Lines with `await expect(` followed by locator → wrap as bridge string
 * - Everything else → leave untouched
 */
function transformToBridgeCalls(code: string): string {
  const lines = code.split('\n');
  const output: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines, comments, imports
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('import ') || trimmed.startsWith('export ')) {
      output.push(line);
      continue;
    }

    // Detect browser lines and transform
    const transformed = transformLine(line, trimmed);
    output.push(transformed);
  }

  return output.join('\n');
}

function transformLine(line: string, trimmed: string): string {
  const indent = line.match(/^(\s*)/)?.[1] || '';

  // await page.method(...)
  if (/^\s*await\s+page\./.test(line)) {
    const expr = trimmed; // e.g., "await page.goto('/login');"
    const clean = expr.replace(/;?\s*$/, ''); // strip trailing semicolon
    return `${indent}await bridge.run(${JSON.stringify(clean)});`;
  }

  // page.method(...) without await (assignments handled in Phase 3)
  // const locator = page.locator(...)  → Phase 3

  // await expect(page...) or await expect(locator...)
  if (/^\s*await\s+expect\s*\(/.test(line)) {
    const expr = trimmed;
    const clean = expr.replace(/;?\s*$/, '');
    return `${indent}await bridge.run(${JSON.stringify(clean)});`;
  }

  // Not a browser line — leave untouched
  return line;
}
