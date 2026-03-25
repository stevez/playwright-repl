/**
 * Compiler — per-call routing pipeline.
 *
 * Analyzes test code and routes each page.* call:
 * - Simple `await page.XXX(literals)` → bridge (fast, runs in SW)
 * - Everything else → Node page (real Playwright, full API)
 *
 * Pipeline: TS → JS (esbuild) → AST (acorn) → classify → transform → bundle
 */

import { findPageCalls } from './parser.js';
import { classifyCall } from './classify.js';
import { transformBridgeCalls } from './transform.js';

export interface CompileResult {
  code: string;
  bridgeCallCount: number;
  nodeCallCount: number;
}

/**
 * Compile JavaScript code with per-call routing.
 * Returns transformed code where bridge-eligible calls are wrapped in __bridge().
 */
export function compileWithRouting(jsCode: string): CompileResult {
  // 1. Parse and find all page/expect calls
  const pageCalls = findPageCalls(jsCode);

  // 2. Classify each call
  let bridgeCallCount = 0;
  let nodeCallCount = 0;
  const bridgeCalls = pageCalls.filter(call => {
    const route = classifyCall(call);
    if (route === 'bridge') { bridgeCallCount++; return true; }
    nodeCallCount++;
    return false;
  });

  // 3. If no bridge calls, return unchanged
  if (bridgeCalls.length === 0) {
    return { code: jsCode, bridgeCallCount: 0, nodeCallCount };
  }

  // 4. Transform bridge calls
  const { code } = transformBridgeCalls(jsCode, bridgeCalls);
  return { code, bridgeCallCount, nodeCallCount };
}

export { findPageCalls, classifyCall, transformBridgeCalls };
