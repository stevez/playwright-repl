/**
 * Bundle a test file for browser mode execution.
 * Same approach as packages/vscode/src/bundler.ts — IIFE + shim.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export async function bundleTestFile(testFilePath: string): Promise<string> {
  const esbuild = await import('esbuild');
  // In dev: resolve from src/. In dist: resolve from dist/.
  // esbuild can compile .ts directly, so point to source.
  let shimPath = path.resolve(path.dirname(__filename), 'shim/test-runner.ts');
  if (!fs.existsSync(shimPath)) {
    shimPath = path.resolve(path.dirname(__filename), 'shim/test-runner.js');
  }

  const result = await esbuild.build({
    entryPoints: [testFilePath],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__tests',
    platform: 'browser',
    alias: {
      '@playwright/test': shimPath,
    },
    external: ['fs', 'path', 'child_process', 'os', 'crypto', 'util', 'stream', 'events', 'net', 'http', 'https'],
  });

  const bundledCode = result.outputFiles[0].text;
  return `${bundledCode}\nawait globalThis.__runTests();\n`;
}
