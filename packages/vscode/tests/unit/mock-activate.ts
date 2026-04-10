/**
 * Vitest-compatible activate helper — no browser needed.
 *
 * Mirrors the Playwright test fixture from tests/playwright/utils.ts
 * but without Playwright Test dependencies or browser contexts.
 * Webview pages are not created — tests that need webview interaction
 * should stay in tests/playwright/.
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { afterEach } from 'vitest';
// @ts-ignore — loaded from dist bundle
import { Extension } from '../../dist/extension';
import { VSCode, TestController, WorkspaceFolder } from '../playwright/mock/vscode';

type ActivateResult = {
  vscode: VSCode;
  testController: TestController;
  workspaceFolder: WorkspaceFolder;
};

type ActivateOptions = {
  rootDir?: string;
  workspaceFolders?: [string, any][];
  env?: Record<string, any>;
};

const instances: VSCode[] = [];

afterEach(() => {
  for (const vscode of instances)
    vscode.dispose();
  instances.length = 0;
});

export async function activate(
  files: { [key: string]: string },
  options?: ActivateOptions,
): Promise<ActivateResult> {
  const outputDir = options?.rootDir || path.join(os.tmpdir(), `pw-test-${crypto.randomBytes(8).toString('hex')}`);

  // null browser — webview pages won't be created
  const vscode = new VSCode(1.86, path.resolve(__dirname, '../..'), null);

  if (options?.workspaceFolders) {
    for (const wf of options.workspaceFolders)
      await vscode.addWorkspaceFolder(wf[0], wf[1]);
  } else {
    await vscode.addWorkspaceFolder(outputDir, files);
  }

  const configuration = vscode.workspace.getConfiguration('playwright-repl');
  if (options?.env)
    configuration.update('env', options.env);

  const extension = new Extension(vscode, vscode.context);
  vscode.extensions.push(extension);
  await vscode.activate();

  instances.push(vscode);
  return {
    vscode,
    testController: vscode.testControllers[0],
    workspaceFolder: vscode.workspace.workspaceFolders[0],
  };
}
