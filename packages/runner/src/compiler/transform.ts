/**
 * Transform — rewrites bridge-classified calls to __bridge("...") calls.
 *
 * Uses magic-string for source-map-preserving replacements.
 */

import MagicString from 'magic-string';
import type { PageCallNode } from './parser.js';

/**
 * Rewrite bridge-classified calls in source code.
 *
 * Transforms:
 *   await page.click('#btn');
 * To:
 *   await __bridge('await page.click("#btn")');
 */
export function transformBridgeCalls(
  code: string,
  bridgeCalls: PageCallNode[],
): { code: string; map: ReturnType<MagicString['generateMap']> } {
  const s = new MagicString(code);

  for (const call of bridgeCalls) {
    // Extract the original expression: "await page.click('#btn')"
    // The node is the ExpressionStatement, which includes the trailing semicolon
    const stmtText = code.slice(call.start, call.end);

    // Strip trailing semicolon and whitespace for the bridge argument
    const exprText = stmtText.replace(/;\s*$/, '').trim();

    // Escape for string literal (single quotes in the expression become escaped)
    const escaped = exprText
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n');

    // Replace the entire statement
    s.overwrite(call.start, call.end, `await __bridge('${escaped}');`);
  }

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true }),
  };
}
