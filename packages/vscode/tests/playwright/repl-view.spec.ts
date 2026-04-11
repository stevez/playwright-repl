/**
 * Tests for ReplView — interactive REPL command panel.
 *
 * Uses the mock VSCode infrastructure to test webview interactions.
 */

import { expect, test } from './utils';

async function typeCommand(replView: any, command: string) {
  const input = replView.locator('#command-input');
  await input.fill(command);
  await input.press('Enter');
}

async function getOutputLines(replView: any): Promise<string[]> {
  return replView.locator('#output .line').allTextContents();
}

async function getLastOutputLine(replView: any): Promise<string> {
  const lines = await getOutputLines(replView);
  return lines[lines.length - 1] ?? '';
}

test('should show welcome message on activate', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const replView = await vscode.webView('playwright-repl.replView');
  await expect(replView.locator('#output')).toContainText('Playwright REPL');
  await expect(replView.locator('#output')).toContainText('Waiting for browser');
});

test('local command .clear should clear output', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const replView = await vscode.webView('playwright-repl.replView');
  // Output has welcome message
  await expect(replView.locator('#output .line')).not.toHaveCount(0);

  await typeCommand(replView, '.clear');
  // After .clear, the command itself is shown but output is cleared
  await expect(replView.locator('#output')).toBeEmpty();
});

test('local command help should show categories', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const replView = await vscode.webView('playwright-repl.replView');
  await typeCommand(replView, 'help');
  await expect(replView.locator('#output')).toContainText('Available commands');
});

test('local command help <unknown> should show error', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const replView = await vscode.webView('playwright-repl.replView');
  await typeCommand(replView, 'help nonexistent');
  await expect(replView.locator('#output .line-error').last()).toContainText('Unknown command');
});

test('local command .history should show session history', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const replView = await vscode.webView('playwright-repl.replView');
  await typeCommand(replView, 'help');
  await typeCommand(replView, '.history');
  // History should contain the 'help' command and '.history' itself
  await expect(replView.locator('#output')).toContainText('help');
});

test('local command .status should show connection status', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const replView = await vscode.webView('playwright-repl.replView');
  await typeCommand(replView, '.status');
  await expect(replView.locator('#output')).toContainText('Browser: stopped');
  await expect(replView.locator('#output')).toContainText('Commands: 0');
});

test('execute when browser not running should show error', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const replView = await vscode.webView('playwright-repl.replView');
  await typeCommand(replView, 'snapshot');
  await expect(replView.locator('#output .line-error').last()).toContainText('Browser not running');
});

test('local command .aliases should show aliases', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const replView = await vscode.webView('playwright-repl.replView');
  await typeCommand(replView, '.aliases');
  await expect(replView.locator('#output')).toContainText('Aliases');
});

test('local command .history clear should clear history', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const replView = await vscode.webView('playwright-repl.replView');
  await typeCommand(replView, 'help');
  await typeCommand(replView, '.history clear');
  await expect(replView.locator('#output')).toContainText('History cleared');
});
