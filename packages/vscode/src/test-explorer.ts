/**
 * Test Explorer
 *
 * Integrates with VS Code's Test Explorer API:
 * - Discovers .spec.ts / .test.ts files
 * - Parses test structure (test, describe, hooks)
 * - Builds a test tree (TestController + TestItems)
 * - Runs tests via bridge mode (bundle + send to playwright-crx)
 * - Maps results back to TestItems (pass/fail/duration)
 */

import * as vscode from 'vscode';
import { parseTestFile, type ParsedTest } from './test-parser.js';
import type { BrowserManager } from './browser.js';

// ─── Test Explorer ─────────────────────────────────────────────────────────

export class TestExplorer {
  private _controller: vscode.TestController;
  private _browserManager: BrowserManager;
  private _outputChannel: vscode.OutputChannel;
  private _watchers: vscode.FileSystemWatcher[] = [];

  constructor(browserManager: BrowserManager, outputChannel: vscode.OutputChannel) {
    this._browserManager = browserManager;
    this._outputChannel = outputChannel;
    this._controller = vscode.tests.createTestController('playwright-ide', 'Playwright IDE');

    // Run profile: executes tests via bridge
    this._controller.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      (request, token) => this._runTests(request, token),
      true, // isDefault
    );

    // Debug profile: runs tests with debugger attached
    this._controller.createRunProfile(
      'Debug',
      vscode.TestRunProfileKind.Debug,
      (request, _token) => this._debugTests(request),
      true,
    );

    // Discover existing test files
    this._discoverTests();

    // Watch for changes
    const pattern = '**/*.{spec,test}.{ts,js,mjs}';
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(uri => this._parseFile(uri));
    watcher.onDidChange(uri => this._parseFile(uri));
    watcher.onDidDelete(uri => this._controller.items.delete(uri.toString()));
    this._watchers.push(watcher);
  }

  get controller() { return this._controller; }

  dispose() {
    this._controller.dispose();
    for (const w of this._watchers) w.dispose();
  }

  // ─── Discovery ───────────────────────────────────────────────────────────

  private async _discoverTests() {
    const folders = vscode.workspace.workspaceFolders;
    this._outputChannel.appendLine(`Workspace folders: ${folders?.map(f => f.uri.fsPath).join(', ') || 'NONE'}`);
    const files = await vscode.workspace.findFiles('**/*.spec.ts', '**/node_modules/**');
    this._outputChannel.appendLine(`Test discovery: found ${files.length} test files`);
    for (const uri of files) {
      this._outputChannel.appendLine(`  ${uri.fsPath}`);
      await this._parseFile(uri);
    }
  }

  private async _parseFile(uri: vscode.Uri) {
    try {
      const content = (await vscode.workspace.fs.readFile(uri)).toString();
      const parsed = parseTestFile(content);
      this._outputChannel.appendLine(`  Parsed ${uri.fsPath}: ${parsed.length} top-level items`);
      if (parsed.length === 0) return;

      const fileName = uri.path.replace(/.*[\\/]/, '');
      const fileItem = this._controller.createTestItem(uri.toString(), fileName, uri);
      this._buildTree(fileItem, parsed, uri);
      this._controller.items.add(fileItem);
    } catch (err: unknown) {
      this._outputChannel.appendLine(`  Error parsing ${uri.fsPath}: ${(err as Error).message}`);
    }
  }

  private _buildTree(parent: vscode.TestItem, tests: ParsedTest[], uri: vscode.Uri) {
    for (const t of tests) {
      const id = `${parent.id}/${t.name}`;
      const item = this._controller.createTestItem(id, t.name, uri);
      item.range = new vscode.Range(t.line, 0, t.line, 0);

      if (t.type === 'describe' && t.children) {
        this._buildTree(item, t.children, uri);
      }

      parent.children.add(item);
    }
  }

  // ─── Run ─────────────────────────────────────────────────────────────────

  private async _runTests(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
    const run = this._controller.createTestRun(request);

    // Collect test items to run
    const items: vscode.TestItem[] = [];
    if (request.include) {
      for (const item of request.include) {
        this._collectLeafTests(item, items);
      }
    } else {
      // Run all
      this._controller.items.forEach(item => this._collectLeafTests(item, items));
    }

    // Group by file
    const byFile = new Map<string, vscode.TestItem[]>();
    for (const item of items) {
      const fileUri = this._getFileUri(item);
      if (!fileUri) continue;
      const key = fileUri.toString();
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key)!.push(item);
    }

    // Auto-launch browser if needed
    if (!this._browserManager.isRunning()) {
      const config = vscode.workspace.getConfiguration('playwright-ide');
      try {
        this._outputChannel.appendLine('Auto-launching browser for test run...');
        await this._browserManager.launch({
          browser: config.get('browser', 'chromium'),
          bridgePort: config.get('bridgePort', 9876),
          headless: config.get('headless', false),
        });
      } catch (err: unknown) {
        for (const item of items) run.errored(item, new vscode.TestMessage((err as Error).message));
        run.end();
        return;
      }
    }

    // Run each file
    for (const [fileKey, fileItems] of byFile) {
      if (token.isCancellationRequested) break;

      for (const item of fileItems) run.started(item);

      const fileUri = vscode.Uri.parse(fileKey);
      try {
        // Detect mode: browser (fast) or compiler (Node.js compatible)
        const { detectTestMode } = await import('./mode-detect.js');
        const mode = await detectTestMode(fileUri.fsPath);
        this._outputChannel.appendLine(`Mode: ${mode === 'browser' ? '⚡ browser (fast)' : '🔧 compiler (Node.js)'}`);

        let resultText: string;
        if (mode === 'browser') {
          const { bundleTestFile } = await import('./bundler.js');
          const script = await bundleTestFile(fileUri.fsPath);
          const result = await this._browserManager.runScript(script);
          resultText = result.text || '';
        } else {
          // Compiler mode: run in Node.js with bridge
          const { compileTestFile, executeCompiledTest } = await import('./compiler.js');
          const compiled = await compileTestFile(fileUri.fsPath);
          this._outputChannel.appendLine('Running in Node.js with bridge...');
          resultText = await executeCompiledTest(compiled, (cmd) => this._browserManager.runCommand(cmd));
        }

        // Parse structured results and map to test items
        this._mapResults(run, fileItems, resultText);
      } catch (err: unknown) {
        for (const item of fileItems) {
          run.errored(item, new vscode.TestMessage((err as Error).message));
        }
      }
    }

    run.end();
  }

  private async _debugTests(request: vscode.TestRunRequest) {
    // Find the test file to debug
    const items: vscode.TestItem[] = [];
    if (request.include) {
      for (const item of request.include) this._collectLeafTests(item, items);
    }
    const fileUri = items[0] ? this._getFileUri(items[0]) : undefined;
    if (!fileUri) return;

    // Launch debug session with the test file
    await vscode.debug.startDebugging(undefined, {
      type: 'playwright-ide',
      request: 'launch',
      name: 'Debug Playwright Test',
      program: fileUri.fsPath,
    });
  }

  private _collectLeafTests(item: vscode.TestItem, out: vscode.TestItem[]) {
    if (item.children.size === 0) {
      out.push(item);
    } else {
      item.children.forEach(child => this._collectLeafTests(child, out));
    }
  }

  private _getFileUri(item: vscode.TestItem): vscode.Uri | undefined {
    if (item.uri) return item.uri;
    if (item.parent) return this._getFileUri(item.parent);
    return undefined;
  }

  private _mapResults(run: vscode.TestRun, items: vscode.TestItem[], output: string) {
    // Parse result lines: "  ✓ name (123ms)" or "  ✗ name (456ms)\n    error"
    const resultLines = output.split('\n');
    const results = new Map<string, { passed: boolean; duration: number; error?: string }>();

    for (let i = 0; i < resultLines.length; i++) {
      const passMatch = resultLines[i].match(/^\s*[✓✔]\s+(.+?)\s+\((\d+)ms\)/);
      if (passMatch) {
        results.set(passMatch[1], { passed: true, duration: parseInt(passMatch[2]) });
        continue;
      }
      const failMatch = resultLines[i].match(/^\s*[✗✘]\s+(.+?)\s+\((\d+)ms\)/);
      if (failMatch) {
        const error = resultLines[i + 1]?.trim() || 'Test failed';
        results.set(failMatch[1], { passed: false, duration: parseInt(failMatch[2]), error });
        continue;
      }
      const skipMatch = resultLines[i].match(/^\s*-\s+(.+?)\s+\(skipped\)/);
      if (skipMatch) {
        results.set(skipMatch[1], { passed: true, duration: 0 });
        continue;
      }
    }

    // Map results to test items
    for (const item of items) {
      // Build full name: "Suite > Test"
      const fullName = this._getFullTestName(item);
      const result = results.get(fullName);

      if (!result) {
        run.skipped(item);
      } else if (result.passed) {
        run.passed(item, result.duration);
      } else {
        run.failed(item, new vscode.TestMessage(result.error || 'Test failed'), result.duration);
      }
    }
  }

  private _getFullTestName(item: vscode.TestItem): string {
    const parts: string[] = [item.label];
    let parent = item.parent;
    while (parent && parent.parent) { // skip file-level item
      parts.unshift(parent.label);
      parent = parent.parent;
    }
    return parts.join(' > ');
  }
}
