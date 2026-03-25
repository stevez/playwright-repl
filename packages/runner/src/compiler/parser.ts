/**
 * Parser — finds all page.* and expect(page.*) calls in JavaScript AST.
 *
 * Uses acorn to parse JS (post-esbuild TS stripping) and walks the AST
 * to find ExpressionStatements containing page-rooted calls.
 */

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export interface PageCallNode {
  /** The ExpressionStatement AST node */
  node: any;
  /** The await expression (if present) */
  awaitExpr: any;
  /** The root call expression */
  callExpr: any;
  /** Start/end positions in source */
  start: number;
  end: number;
  /** Ancestor nodes for context */
  ancestors: any[];
}

/**
 * Check if an expression is rooted at the `page` identifier.
 * Walks down MemberExpression/CallExpression chains to find the root.
 */
function getRoot(node: any): string | null {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return getRoot(node.object);
  if (node.type === 'CallExpression') return getRoot(node.callee);
  return null;
}

/**
 * Check if a call expression is `expect(page.*)`.
 */
function isExpectPageCall(node: any): boolean {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  // expect(page.locator(...)).toBeVisible() — callee is expect(page.*).toBeVisible
  // Walk to find if root is expect() with page-rooted arg
  if (callee.type === 'MemberExpression') {
    const obj = callee.object;
    if (obj.type === 'CallExpression' && getRoot(obj.callee) === 'expect') {
      // Check if first arg is page-rooted
      return obj.arguments.length > 0 && getRoot(obj.arguments[0]) === 'page';
    }
    // Deeper chain: expect(page.*).not.toBeVisible()
    return isExpectPageCall(obj);
  }
  return false;
}

/**
 * Parse JavaScript and find all page-rooted ExpressionStatements.
 */
export function findPageCalls(code: string): PageCallNode[] {
  const ast = acorn.parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
  });

  const calls: PageCallNode[] = [];

  walk.ancestor(ast, {
    ExpressionStatement(node: any, ancestors: any[]) {
      const expr = node.expression;

      // Must be: await <something>
      if (expr.type !== 'AwaitExpression') return;

      const arg = expr.argument;

      // Check if it's page-rooted or expect(page.*)-rooted
      const root = getRoot(arg);
      const isPage = root === 'page';
      const isExpect = isExpectPageCall(arg);

      if (!isPage && !isExpect) return;

      calls.push({
        node,
        awaitExpr: expr,
        callExpr: arg,
        start: node.start,
        end: node.end,
        ancestors: [...ancestors],
      });
    },
  });

  return calls;
}
