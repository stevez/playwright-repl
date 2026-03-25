/**
 * Classify — determines if a page call goes to bridge or stays on Node.
 *
 * The one rule: only standalone `await page.XXX(literal_args)` with
 * no return value goes to bridge. Everything else stays on Node.
 */

import type { PageCallNode } from './parser.js';

export type CallRoute = 'bridge' | 'node';

// Methods that must always stay on Node (callbacks, non-serializable returns)
const NODE_ONLY_METHODS = new Set([
  'evaluateHandle',
  '$', '$$', '$eval', '$$eval',
  'on', 'once', 'off',
  'route', 'unroute', 'routeFromHAR', 'unrouteAll',
  'waitForEvent', 'waitForResponse', 'waitForRequest',
  'frames', 'mainFrame',
]);

/**
 * Get the method name from a call expression.
 * e.g. page.click('#btn') → 'click'
 *      page.locator('.x').click() → 'click'
 */
function getMethodName(node: any): string | null {
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
    const prop = node.callee.property;
    return prop.type === 'Identifier' ? prop.name : null;
  }
  return null;
}

/**
 * Get all method names in a call chain.
 * e.g. page.locator('.x').click() → ['locator', 'click']
 */
function getMethodChain(node: any): string[] {
  const methods: string[] = [];
  let current = node;
  while (current.type === 'CallExpression' && current.callee.type === 'MemberExpression') {
    const prop = current.callee.property;
    if (prop.type === 'Identifier') methods.unshift(prop.name);
    // Also collect property access names (e.g. page.mouse.move → 'mouse')
    const obj = current.callee.object;
    if (obj.type === 'MemberExpression' && obj.property.type === 'Identifier') {
      methods.unshift(obj.property.name);
    }
    current = current.callee.object;
  }
  return methods;
}

/**
 * Check if a call expression has .then() or .catch() chained.
 */
function hasPromiseChain(node: any): boolean {
  // The node itself might be page.click().then()
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
    const prop = node.callee.property;
    if (prop.type === 'Identifier' && (prop.name === 'then' || prop.name === 'catch')) {
      return true;
    }
  }
  return false;
}

/**
 * Check if all arguments in a call chain are literals (serializable).
 * Variables/expressions can't be serialized to bridge string.
 */
function hasOnlyLiteralArgs(node: any): boolean {
  if (node.type !== 'CallExpression') return true;

  // Check this call's arguments
  for (const arg of node.arguments) {
    if (!isLiteral(arg)) return false;
  }

  // Check parent call in chain (e.g. page.locator('.x').click())
  if (node.callee.type === 'MemberExpression') {
    return hasOnlyLiteralArgs(node.callee.object);
  }

  return true;
}

/**
 * Check if an AST node is a literal value (serializable as string).
 */
function isLiteral(node: any): boolean {
  switch (node.type) {
    case 'Literal': return true;
    case 'TemplateLiteral':
      // Only if no expressions (pure template)
      return node.expressions.length === 0;
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      // Functions are serializable (Playwright serializes them for evaluate)
      return true;
    case 'ObjectExpression':
      return node.properties.every((p: any) =>
        p.type === 'Property' && isLiteral(p.value) &&
        (p.key.type === 'Identifier' || p.key.type === 'Literal')
      );
    case 'ArrayExpression':
      return node.elements.every((e: any) => e && isLiteral(e));
    case 'UnaryExpression':
      // -1, !true, etc.
      return isLiteral(node.argument);
    default:
      return false;
  }
}

/**
 * Check if a node is inside Promise.all() or Promise.race().
 */
function isInsidePromiseAll(ancestors: any[]): boolean {
  for (const a of ancestors) {
    if (a.type === 'CallExpression' && a.callee.type === 'MemberExpression') {
      const obj = a.callee.object;
      const prop = a.callee.property;
      if (obj.type === 'Identifier' && obj.name === 'Promise' &&
          prop.type === 'Identifier' && (prop.name === 'all' || prop.name === 'race')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Classify a page call as bridge or node.
 */
export function classifyCall(call: PageCallNode): CallRoute {
  const { callExpr, ancestors } = call;

  // Has .then()/.catch() chain → node
  if (hasPromiseChain(callExpr)) return 'node';

  // Inside Promise.all/Promise.race → node
  if (isInsidePromiseAll(ancestors)) return 'node';

  // Check method chain for node-only methods
  const methods = getMethodChain(callExpr);
  for (const m of methods) {
    if (NODE_ONLY_METHODS.has(m)) return 'node';
  }

  // Non-literal arguments → node (can't serialize variables to string)
  if (!hasOnlyLiteralArgs(callExpr)) return 'node';

  // All checks passed → bridge
  return 'bridge';
}
