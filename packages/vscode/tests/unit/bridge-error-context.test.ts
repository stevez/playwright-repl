import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { buildBridgeErrorContext } from '../../src/utils';

describe('buildBridgeErrorContext', () => {
  it('generates markdown with instructions, test info, and error details', () => {
    const result = buildBridgeErrorContext(
      'should add todo',
      '/fake/tests/todo.spec.ts',
      'expect(received).toBe(expected)\n\nExpected: 2\nReceived: 1',
    );

    expect(result).toContain('# Instructions');
    expect(result).toContain('Explain why, be concise');
    expect(result).toContain('# Test info');
    expect(result).toContain('should add todo');
    expect(result).toContain('# Error details');
    expect(result).toContain('expect(received).toBe(expected)');
    expect(result).toContain('Expected: 2');
    expect(result).toContain('Received: 1');
    // No code fences — VS Code markdown doesn't support them inside <details>
    expect(result).not.toContain('```');
  });

  it('includes test source when file is readable', () => {
    const spy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
      "import { test, expect } from '@playwright/test';\ntest('should add todo', async () => {\n  expect(1).toBe(2);\n});\n"
    );

    const result = buildBridgeErrorContext(
      'should add todo',
      '/fake/tests/todo.spec.ts',
      'error',
    );

    expect(result).toContain('# Test source');
    expect(result).toContain("import { test, expect }");
    expect(result).toContain('expect(1).toBe(2)');
    // Line numbers
    expect(result).toContain('  1 |');
    expect(result).toContain('  2 |');

    spy.mockRestore();
  });

  it('omits test source when file is not readable', () => {
    const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('ENOENT'); });

    const result = buildBridgeErrorContext(
      'should add todo',
      '/fake/tests/todo.spec.ts',
      'error',
    );

    expect(result).not.toContain('# Test source');

    spy.mockRestore();
  });

  it('uses relative file path in test info when workspace folder is provided', () => {
    const wsFolder = '/home/user/project';
    const result = buildBridgeErrorContext(
      'my test',
      path.join(wsFolder, 'tests', 'example.spec.ts'),
      'error',
      { workspaceFolder: wsFolder },
    );

    expect(result).toContain(`tests${path.sep}example.spec.ts >> my test`);
    expect(result).not.toContain(wsFolder);
  });

  it('includes page snapshot when provided', () => {
    const result = buildBridgeErrorContext(
      'my test',
      '/fake/tests/todo.spec.ts',
      'error',
      { pageSnapshot: '- button "click me" [ref=e1]' },
    );

    expect(result).toContain('# Page snapshot');
    expect(result).toContain('- button "click me" [ref=e1]');
  });

  it('uses code fences when useCodeFences is true', () => {
    const result = buildBridgeErrorContext(
      'my test',
      '/fake/tests/todo.spec.ts',
      'error message',
      { useCodeFences: true, pageSnapshot: '- button' },
    );

    expect(result).toContain('```');
    expect(result).toContain('```yaml');
  });

  it('annotates the failing line with > marker and ^ pointer', () => {
    const spy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
      "import { test, expect } from '@playwright/test';\ntest('should fail', async () => {\n  expect(1).toBe(2);\n});\n"
    );

    const result = buildBridgeErrorContext(
      'should fail',
      '/fake/tests/todo.spec.ts:3:13',
      'Error at tests/todo.spec.ts:3:13 — assertion failed',
    );

    // The failing line (3) should be marked with >
    expect(result).toMatch(/>\s*3\s*\|\s+expect\(1\)/);
    // The ^ pointer should be on the next line
    expect(result).toContain('^');

    spy.mockRestore();
  });

  it('parses line:column from error and uses it in Location', () => {
    const result = buildBridgeErrorContext(
      'my test',
      '/fake/tests/todo.spec.ts',
      'Error at tests/todo.spec.ts:42:10 — something broke',
      { workspaceFolder: '/fake' },
    );

    expect(result).toContain('Location: tests');
    expect(result).toContain(':42:10');
  });
});
