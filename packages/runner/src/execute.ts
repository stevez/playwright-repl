/**
 * Execute a test file via bridge mode.
 * Uses the same compiler/bundler approach as the VS Code extension.
 */

import type { BridgeServer } from '@playwright-repl/core';
import type { RunOptions, TestResult } from './types.js';

export async function executeTestFile(
  testFilePath: string,
  bridge: BridgeServer,
  opts: RunOptions,
): Promise<TestResult[]> {
  // TODO: detect mode (browser vs compiler) and use the appropriate path
  // For Phase 1: always use browser mode (bundle + send to bridge)

  const { bundleTestFile } = await import('./bundler.js');
  const script = await bundleTestFile(testFilePath);
  const result = await bridge.runScript(script, 'javascript');

  // Parse result text into TestResult array
  return parseResults(result.text || '', testFilePath);
}

function parseResults(output: string, file: string): TestResult[] {
  const results: TestResult[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const passMatch = lines[i].match(/^\s*[✓✔]\s+(.+?)\s+\((\d+)ms\)/);
    if (passMatch) {
      results.push({ name: passMatch[1], file, passed: true, skipped: false, duration: parseInt(passMatch[2]) });
      continue;
    }
    const failMatch = lines[i].match(/^\s*[✗✘]\s+(.+?)\s+\((\d+)ms\)/);
    if (failMatch) {
      const error = lines[i + 1]?.trim() || 'Test failed';
      results.push({ name: failMatch[1], file, passed: false, skipped: false, error, duration: parseInt(failMatch[2]) });
      continue;
    }
    const skipMatch = lines[i].match(/^\s*-\s+(.+?)\s+\(skipped\)/);
    if (skipMatch) {
      results.push({ name: skipMatch[1], file, passed: true, skipped: true, duration: 0 });
    }
  }

  return results;
}
