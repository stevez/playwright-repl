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
