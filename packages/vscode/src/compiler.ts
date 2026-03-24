/**
 * Compiler
 *
 * Transforms a test file for Node.js execution with bridge commands.
 * Uses esbuild plugin to transform page and expect calls BEFORE compilation,
 * so esbuild validates the transformed code.
 *
 * Flow:
 *   TS source → onLoad plugin (transform page/expect → bridge.run) → esbuild (compile + validate) → valid JS
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// __filename is available at runtime in esbuild's CJS output
declare const __filename: string;

/**
 * Compile a test file for Node.js + bridge execution.
 * Transforms page/expect calls to bridge.run() during compilation.
 */
export async function compileTestFile(testFilePath: string): Promise<string> {
  const esbuild = await import('esbuild');
  const shimPath = path.resolve(path.dirname(__filename), '../src/shim/test-runner-node.ts');
  const testDir = path.dirname(testFilePath);
  const testFileName = path.basename(testFilePath);

  // Plugin: transforms test files and provides the entry wrapper
  const bridgePlugin = {
    name: 'bridge-transform',
    setup(build: any) {
      // Virtual entry that imports __runTests + the test file
      build.onResolve({ filter: /^__test-entry__$/ }, () => ({
        path: '__test-entry__',
        namespace: 'bridge',
      }));
      build.onLoad({ filter: /.*/, namespace: 'bridge' }, () => ({
        contents: `
          import { __runTests } from '@playwright/test';
          import './${testFileName}';
          const __result = await __runTests();
          export default __result;
        `,
        resolveDir: testDir,
        loader: 'ts',
      }));

      // Transform .spec.ts / .test.ts files: page/expect → bridge.run()
      build.onLoad({ filter: /\.(spec|test)\.(ts|js|mjs)$/ }, (args: any) => {
        const source = fs.readFileSync(args.path, 'utf-8');
        const transformed = transformSource(source);
        return {
          contents: transformed,
          loader: args.path.endsWith('.ts') ? 'ts' : 'js',
          resolveDir: path.dirname(args.path),
        };
      });
    },
  };

  const result = await esbuild.build({
    entryPoints: ['__test-entry__'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',  // source maps for Node.js debugger
    plugins: [bridgePlugin],
    alias: {
      '@playwright/test': shimPath,
    },
    external: [
      'fs', 'path', 'child_process', 'os', 'crypto', 'util',
      'stream', 'events', 'net', 'http', 'https', 'url',
      'worker_threads', 'node:*',
    ],
  });

  return result.outputFiles[0].text;
}

/**
 * Execute compiled test code in Node.js with bridge context.
 * Writes to a temp .mjs file and dynamically imports it.
 */
export async function executeCompiledTest(
  compiledCode: string,
  bridgeRun: (command: string) => Promise<{ text?: string; isError?: boolean }>,
): Promise<string> {
  // Make bridge.run available as a global
  (globalThis as any).bridge = {
    run: async (command: string) => {
      const result = await bridgeRun(command);
      if (result.isError) throw new Error(result.text || 'Bridge command failed');
      return result;
    },
  };

  const tmpFile = path.join(os.tmpdir(), `pw-test-${Date.now()}.mjs`);

  try {
    fs.writeFileSync(tmpFile, compiledCode);
    const module = await import(`file://${tmpFile.replace(/\\/g, '/')}`);
    return typeof module.default === 'string' ? module.default : '(no output)';
  } finally {
    delete (globalThis as any).bridge;
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * Create a debug runner file — no compilation, no transforms.
 * Just a plain wrapper that connects to Chrome via CDP and runs the test.
 * Returns the temp file path. Caller must clean up.
 */
export function createDebugRunner(
  testFilePath: string,
  cdpPort: number,
): string {
  const testDir = path.dirname(testFilePath);
  const testFileName = path.basename(testFilePath);
  const shimRelPath = path.relative(testDir, path.resolve(path.dirname(__filename), '../src/shim/test-runner-node.ts')).replace(/\\/g, '/');

  const script = `
import { chromium } from 'playwright-core';

// Connect to the already-running Chrome
const browser = await chromium.connectOverCDP('http://localhost:${cdpPort}');
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();

// Provide page/context as globals for the test
globalThis.page = page;
globalThis.context = context;

// Import our test shim (provides test/describe/beforeEach/expect)
const { __runTests } = await import('${shimRelPath}');

// Import the test file
await import('./${testFileName}');

// Run and report
const result = await __runTests();
console.log(result);

await browser.close();
`;

  const tmpFile = path.join(testDir, `.pw-debug-${Date.now()}.mjs`);
  fs.writeFileSync(tmpFile, script);
  return tmpFile;
}

// ─── Source Transform ──────────────────────────────────────────────────────

/**
 * Transform test source: page.* and expect() calls → bridge.run("...").
 * Runs BEFORE esbuild compilation, so esbuild validates the result.
 */
function transformSource(source: string): string {
  const lines = source.split('\n');
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('import ') || trimmed.startsWith('export ')) {
      return line;
    }
    return transformLine(line, trimmed);
  }).join('\n');
}

function transformLine(line: string, trimmed: string): string {
  const indent = line.match(/^(\s*)/)?.[1] || '';

  // const x = await page.method(...) — return value needed
  const assignMatch = trimmed.match(/^((?:const|let|var)\s+\w+)\s*=\s*(await\s+page\..+?);?\s*$/);
  if (assignMatch) {
    const varDecl = assignMatch[1]; // "const title"
    const expr = assignMatch[2].replace(/;?\s*$/, ''); // "await page.title()"
    return `${indent}${varDecl} = JSON.parse((await bridge.run("JSON.stringify(" + ${JSON.stringify(expr)} + ")")).text ?? 'null');`;
  }

  // await page.method(...) — no return value
  if (/^\s*await\s+page\./.test(line)) {
    const clean = trimmed.replace(/;?\s*$/, '');
    return `${indent}await bridge.run(${JSON.stringify(clean)});`;
  }

  // await expect(...)
  if (/^\s*await\s+expect\s*\(/.test(line)) {
    const clean = trimmed.replace(/;?\s*$/, '');
    return `${indent}await bridge.run(${JSON.stringify(clean)});`;
  }

  return line;
}
