/**
 * Vitest polling helpers — equivalent to Playwright's custom matchers.
 *
 * These poll until the condition is met or timeout, similar to
 * expect.poll() in Playwright Test.
 */

import { expect } from 'vitest';
import type { TestController } from '../playwright/mock/vscode';
import type { VSCode } from '../playwright/mock/vscode';

async function poll<T>(fn: () => T | Promise<T>, timeout = 10000, interval = 100): Promise<T> {
  const start = Date.now();
  let lastValue: T;
  while (Date.now() - start < timeout) {
    lastValue = await fn();
    if (lastValue !== undefined && lastValue !== null) return lastValue;
    await new Promise(r => setTimeout(r, interval));
  }
  return lastValue!;
}

export async function expectTestTree(testController: TestController, expected: string, timeout = 10000) {
  const start = Date.now();
  let actual: string = '';
  while (Date.now() - start < timeout) {
    actual = testController.renderTestTree();
    if (actual === expected) return;
    await new Promise(r => setTimeout(r, 100));
  }
  expect(actual).toBe(expected);
}

export async function expectRenderLog(testRun: any, expected: string, timeout = 10000) {
  const start = Date.now();
  let actual: string = '';
  while (Date.now() - start < timeout) {
    actual = testRun.renderLog();
    if (actual === expected) return;
    await new Promise(r => setTimeout(r, 100));
  }
  expect(actual).toBe(expected);
}

export async function expectConnectionLog(vscode: VSCode, expected: any[], timeout = 10000) {
  const filterCommands = new Set(['ping', 'initialize']);
  const filteredLog = () => vscode.connectionLog.filter((e: any) => !filterCommands.has(e.method));
  const start = Date.now();
  let actual: any[] = [];
  while (Date.now() - start < timeout) {
    actual = filteredLog();
    try {
      expect(actual).toEqual(expected);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  expect(actual).toEqual(expected);
}
