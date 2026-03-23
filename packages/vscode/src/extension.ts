import * as vscode from 'vscode';
import { BrowserManager } from './browser.js';
import { PlaywrightRepl } from './repl.js';
import { TestExplorer } from './test-explorer.js';

let browserManager: BrowserManager | undefined;
let repl: PlaywrightRepl | undefined;
let testExplorer: TestExplorer | undefined;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Playwright IDE');
  outputChannel.appendLine('Playwright IDE activated');
  browserManager = new BrowserManager(outputChannel);

  // ─── Test Explorer ────────────────────────────────────────────────────────
  testExplorer = new TestExplorer(browserManager, outputChannel);
  context.subscriptions.push({ dispose: () => testExplorer?.dispose() });

  // ─── Launch Browser ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-ide.launchBrowser', async () => {
      if (browserManager!.isRunning()) {
        vscode.window.showInformationMessage('Browser is already running.');
        return;
      }
      try {
        const config = vscode.workspace.getConfiguration('playwright-ide');
        await browserManager!.launch({
          browser: config.get('browser', 'chromium'),
          bridgePort: config.get('bridgePort', 9876),
        });
        outputChannel.show();
        vscode.window.showInformationMessage('Playwright IDE: Browser launched.');

        // Auto-open REPL after launch
        if (!repl || repl.disposed) {
          repl = new PlaywrightRepl(browserManager!);
          repl.show();
        }
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to launch browser: ${(err as Error).message}`);
      }
    })
  );

  // ─── Open REPL ───────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-ide.openRepl', () => {
      if (!browserManager?.isRunning()) {
        vscode.window.showWarningMessage('Launch browser first (Playwright IDE: Launch Browser).');
        return;
      }
      if (!repl || repl.disposed) {
        repl = new PlaywrightRepl(browserManager!);
      }
      repl.show();
    })
  );

  // ─── Run Test File ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-ide.runTest', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active test file.');
        return;
      }
      const filePath = editor.document.uri.fsPath;
      if (!/\.(spec|test)\.(ts|js|mjs)$/.test(filePath)) {
        vscode.window.showWarningMessage('Not a test file. Open a .spec.ts or .test.ts file first.');
        return;
      }
      const fileName = filePath.replace(/.*[\\/]/, '');

      try {
        // Auto-launch browser if not running (headless for test execution)
        if (!browserManager?.isRunning()) {
          const config = vscode.workspace.getConfiguration('playwright-ide');
          outputChannel.appendLine('Auto-launching browser for test run...');
          await browserManager!.launch({
            browser: config.get('browser', 'chromium'),
            bridgePort: config.get('bridgePort', 9876),
            headless: config.get('headless', false),
          });
          outputChannel.show();
        }

        const { bundleTestFile } = await import('./bundler.js');
        outputChannel.appendLine(`Bundling ${fileName}...`);
        const script = await bundleTestFile(filePath);
        outputChannel.appendLine(`Running tests in ${fileName}...`);
        const result = await browserManager!.runScript(script);
        outputChannel.appendLine(`\n── ${fileName} ──`);
        outputChannel.appendLine(result.text || '(no output)');
        outputChannel.show();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Test run failed: ${(err as Error).message}`);
      }
    })
  );

  // ─── Stop Browser ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-ide.stopBrowser', async () => {
      if (browserManager?.isRunning()) {
        await browserManager.stop();
        vscode.window.showInformationMessage('Browser stopped.');
      }
    })
  );

  // ─── Cleanup on deactivation ─────────────────────────────────────────────
  context.subscriptions.push({
    dispose: () => {
      browserManager?.stop();
    }
  });
}

export function deactivate() {
  browserManager?.stop();
}
