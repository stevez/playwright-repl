/**
 * Test Parser
 *
 * Scans .spec.ts / .test.ts files and extracts the test structure:
 * - test('name', ...) → test items with line numbers
 * - test.describe('name', ...) → suites with children
 * - test.skip / test.only → flags
 *
 * Uses regex + brace depth tracking to handle nested closures correctly.
 */

export interface ParsedTest {
  name: string;
  line: number;       // 0-based line number
  type: 'test' | 'describe';
  modifier?: 'only' | 'skip';
  children?: ParsedTest[];
}

/**
 * Parse a test file and return the test structure.
 */
export function parseTestFile(content: string): ParsedTest[] {
  const lines = content.split('\n');
  const root: ParsedTest[] = [];

  // Stack tracks: [target children array, brace depth when entered]
  const stack: { children: ParsedTest[]; depth: number }[] = [{ children: root, depth: 0 }];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Count braces (outside strings — simplified, works for standard test patterns)
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') {
        braceDepth--;
        // Pop stack when we close back to the describe's brace depth
        if (stack.length > 1 && braceDepth <= stack[stack.length - 1].depth) {
          stack.pop();
        }
      }
    }

    // test.describe('name', ...
    const describeMatch = line.match(/test\.describe(?:\.(only|skip))?\s*\(\s*(['"`])(.+?)\2/);
    if (describeMatch) {
      const suite: ParsedTest = {
        name: describeMatch[3],
        line: i,
        type: 'describe',
        modifier: describeMatch[1] as 'only' | 'skip' | undefined,
        children: [],
      };
      stack[stack.length - 1].children.push(suite);
      // Push after brace counting so we capture the opening { depth correctly
      stack.push({ children: suite.children!, depth: braceDepth - 1 });
      continue;
    }

    // test('name', ... or test.only('name', ... or test.skip('name', ...
    const testMatch = line.match(/(?:^|\s)test(?:\.(only|skip))?\s*\(\s*(['"`])(.+?)\2/);
    if (testMatch) {
      stack[stack.length - 1].children.push({
        name: testMatch[3],
        line: i,
        type: 'test',
        modifier: testMatch[1] as 'only' | 'skip' | undefined,
      });
    }
  }

  return root;
}
