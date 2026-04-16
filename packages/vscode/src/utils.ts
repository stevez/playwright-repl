/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import which from 'which';
import * as vscodeTypes from './vscodeTypes';

export function createGuid(): string {
  return crypto.randomBytes(16).toString('hex');
}

const ansiRegex = new RegExp('([\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])))', 'g');
export function stripAnsi(str: string): string {
  return str.replace(ansiRegex, '');
}

export function stripBabelFrame(text: string) {
  const result: string[] =  [];
  for (const line of text.split('\n')) {
    if (!line.trim().match(/>?\s*\d*\s*\|/))
      result.push(line);
  }
  return result.join('\n').trim();
}

export async function spawnAsync(executable: string, args: string[], cwd?: string, settingsEnv?: NodeJS.ProcessEnv): Promise<string> {
  const childProcess = spawn(executable, args, {
    stdio: 'pipe',
    cwd,
    env: { ...process.env, ...settingsEnv }
  });
  let output = '';
  childProcess.stdout.on('data', data => output += data.toString());
  return new Promise<string>((f, r) => {
    childProcess.on('error', error => r(error));
    childProcess.on('close', () => f(output));
  });
}

export async function resolveSourceMap(file: string, fileToSources: Map<string, string[]>, sourceToFile: Map<string, string>): Promise<string[]> {
  if (!file.endsWith('.js'))
    return [file];
  const cached = fileToSources.get(file);
  if (cached)
    return cached;

  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });

  let lastLine: string | undefined;
  rl.on('line', line => {
    lastLine = line;
  });
  await new Promise(f => rl.on('close', f));

  if (lastLine?.startsWith('//# sourceMappingURL=')) {
    const sourceMappingFile = path.resolve(path.dirname(file), lastLine.substring('//# sourceMappingURL='.length));
    try {
      const sourceMapping = await fs.promises.readFile(sourceMappingFile, 'utf-8');
      const sources = JSON.parse(sourceMapping).sources;
      const sourcePaths = sources.map((s: string) => {
        const source = path.resolve(path.dirname(sourceMappingFile), s);
        sourceToFile.set(source, file);
        return source;
      });
      fileToSources.set(file, sourcePaths);
      return sourcePaths;
    } catch (e) {
    }
  }
  fileToSources.set(file, [file]);
  return [file];
}

export class NodeJSNotFoundError extends Error {}

let pathToNodeJS: string | undefined;

export async function findNode(vscode: vscodeTypes.VSCode, cwd: string, logger: vscodeTypes.LogOutputChannel): Promise<string> {
  if (pathToNodeJS)
    return pathToNodeJS;

  logger.info('Resolving node binary via process.env.PATH');
  // Stage 1: Try to find Node.js via process.env.PATH
  let node = await which('node').catch(e => undefined);
  // Stage 2: When extension host boots, it does not have the right env set, so we might need to wait.
  for (let i = 0; i < 5 && !node; ++i) {
    await new Promise(f => setTimeout(f, 200));
    node = await which('node').catch(e => undefined);
    logger.info('Resolving node binary via process.env.PATH, attempt #' + (i + 2));
  }
  // Stage 3: If we still haven't found Node.js, try to find it via a subprocess.
  // This evaluates shell rc/profile files and makes nvm work.
  node ??= await findNodeViaShell(vscode, cwd);
  if (!node) {
    logger.error('Failed to resolve node binary');
    throw new NodeJSNotFoundError(`Unable to find 'node' executable.\nMake sure to have Node.js installed and available in your PATH.\nCurrent PATH: '${process.env.PATH}'.`);
  }
  pathToNodeJS = node;
  logger.info(`Resolved node binary: ${node}`);
  return node;
}

async function findNodeViaShell(vscode: vscodeTypes.VSCode, cwd: string): Promise<string | undefined> {
  if (process.platform === 'win32')
    return undefined;
  return new Promise<string | undefined>(resolve => {
    const startToken = '___START_PW_SHELL__';
    const endToken = '___END_PW_SHELL__';
    // NVM lazily loads Node.js when 'node' alias is invoked. In order to invoke it, we run 'node --version' if 'node' is a function.
    // See https://github.com/microsoft/playwright/issues/33996
    const childProcess = spawn(`${vscode.env.shell} -i -c 'if [[ $(type node 2>/dev/null) == *function* ]]; then node --version; fi; echo ${startToken} && which node && echo ${endToken}'`, {
      stdio: 'pipe',
      shell: true,
      cwd,
    });
    let output = '';
    childProcess.stdout.on('data', data => output += data.toString());
    childProcess.on('error', () => resolve(undefined));
    childProcess.on('exit', exitCode => {
      if (exitCode !== 0)
        return resolve(undefined);
      const start = output.indexOf(startToken);
      const end = output.indexOf(endToken);
      if (start === -1 || end === -1)
        return resolve(undefined);
      return resolve(output.substring(start + startToken.length, end).trim());
    });
  });
}

export function addNpmRunPath(env: NodeJS.ProcessEnv, cwd: string): NodeJS.ProcessEnv {
  const newPath = [];

  let currentPath = path.resolve(cwd);
  let previousPath;
  while (previousPath !== currentPath) {
    newPath.push(path.join(currentPath, 'node_modules', '.bin'));
    previousPath = currentPath;
    currentPath = path.resolve(currentPath, '..');
  }

  // On Windows, PATH key casing can be “Path”; preserve whichever exists
  const defaultPath = process.platform === 'win32' ? 'Path' : 'PATH';
  const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') ?? defaultPath;
  if (env[pathKey])
    newPath.push(env[pathKey]);

  return {
    ...env,
    [pathKey]: newPath.join(pathSeparator),
  };
}

export function escapeRegex(text: string) {
  // playwright interprets absolute paths as regex,
  // removing the leading slash prevents that.
  if (text.startsWith('/'))
    text = text.substring(1);
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const pathSeparator = process.platform === 'win32' ? ';' : ':';

export async function runNode(vscode: vscodeTypes.VSCode, args: string[], cwd: string, env: NodeJS.ProcessEnv, logger: vscodeTypes.LogOutputChannel): Promise<string> {
  return await spawnAsync(await findNode(vscode, cwd, logger), args, cwd, env);
}

export async function getPlaywrightInfo(vscode: vscodeTypes.VSCode, workspaceFolder: string, configFilePath: string, env: NodeJS.ProcessEnv, logger: vscodeTypes.LogOutputChannel): Promise<{ version: number, cli: string }> {
  const pwtInfo = await runNode(vscode, [
    require.resolve('./playwrightFinder'),
  ], path.dirname(configFilePath), env, logger);
  const { version, cli, error } = JSON.parse(pwtInfo) as { version: number, cli: string, error?: string };
  if (error)
    throw new Error(error);
  let cliOverride = cli;
  if (cli.includes('/playwright/packages/playwright-test/') && configFilePath.includes('playwright-test'))
    cliOverride = path.join(workspaceFolder, 'tests/playwright-test/stable-test-runner/node_modules/@playwright/test/cli.js');
  return { cli: cliOverride, version };
}

export function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

// this is a no-op template tag. it instructs the "bierner.lit-html" vscode extension to highlight the string as HTML.
export function html(strings: TemplateStringsArray, ...expressions: unknown[]) {
  return strings.reduce((acc, str, i) => acc + expressions[i - 1] + str);
}

/**
 * This function converts lowercase drive letter to uppercase drive letter.
 *
 * ---- Explanation ----
 *
 * The Windows Filesystem is case-insensitive, but Node.js module loading is case-sensitive.
 * That means that on Windows, C:\foo and c:\foo point to the same file,
 * but on Node.js require-ing both of them will result in two instances of the file.
 * This can lead to two instances of @playwright/test being loaded, which can't happen.
 *
 * On top of that, Node.js' require algorithm sometimes turns `c:\foo` into `C:\foo`.
 * So we need to make sure that we always pass uppercase paths to Node.js.
 *
 * VS Code knows about this problem and already performs this in some cases, for example in `vscode.debug.startDebugging`.
 * But lots of other places do not, like Playwright's `--config <file>` or the CWD passed into node:child_process.
 * More on this in https://github.com/microsoft/playwright-vscode/pull/538#issuecomment-2404265216.
 *
 * ---- Solution ----
 *
 * Internally, we always use Playwright-style paths with uppercase driver letter.
 * When receiving a Uri from VSCode apis, we convert it with `uriToPath(uri)`.
 * When passing a Uri to VSCode apis, we call `vscode.Uri.file(path)`.
 */
export function uriToPath(uri: vscodeTypes.Uri): string {
  // eslint-disable-next-line no-restricted-properties
  return normalizePath(uri.fsPath);
}

export interface BridgeErrorContextOptions {
  workspaceFolder?: string;
  /** Page accessibility snapshot at failure time (from bridge.run('snapshot')). */
  pageSnapshot?: string;
  /** Use ``` code fences (true for md file) or plain indented text (false for inline TestMessage). */
  useCodeFences?: boolean;
  /** Fallback line (1-based) when error message has no parseable location. Typically the test declaration line. */
  fallbackLine?: number;
}

/**
 * Parse the first file:line:column from error text.
 * Matches both bare `file.spec.ts:13:7` and stack frames `at fn (file.spec.ts:13:7)`.
 */
function parseErrorLocation(errorText: string, filePath: string): { line: number; column: number } | undefined {
  const fileName = path.basename(filePath);
  // Prefer a location that references our test file
  const fileRe = new RegExp(`${fileName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}:(\\d+):(\\d+)`);
  const fileMatch = errorText.match(fileRe);
  if (fileMatch) return { line: parseInt(fileMatch[1], 10), column: parseInt(fileMatch[2], 10) };
  // Fallback: any line:column pattern
  const anyMatch = errorText.match(/:(\d+):(\d+)(?:\D|$)/);
  if (anyMatch) return { line: parseInt(anyMatch[1], 10), column: parseInt(anyMatch[2], 10) };
  return undefined;
}

/**
 * Build a code frame with `>` marker on the error line and `^` pointer at the column.
 * Matches Playwright's buildCodeFrame output format.
 */
function buildCodeFrame(filePath: string, errorLoc: { line: number; column: number }, errorMessage: string): string | undefined {
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
  const sourceLines = source.split('\n');
  const linesAbove = 100;
  const linesBelow = 100;
  const start = Math.max(0, errorLoc.line - linesAbove - 1);
  const end = Math.min(sourceLines.length, errorLoc.line + linesBelow);
  const scope = sourceLines.slice(start, end);
  const lineNumberWidth = String(end).length;
  const firstMessageLine = stripAnsi(errorMessage || '').split('\n')[0] || undefined;

  const frame = scope.map(
    (line, index) =>
      `${start + index + 1 === errorLoc.line ? '> ' : '  '}${(start + index + 1).toString().padEnd(lineNumberWidth, ' ')} | ${line}`,
  );
  if (firstMessageLine) {
    frame.splice(
      errorLoc.line - start,
      0,
      `${' '.repeat(lineNumberWidth + 2)} | ${' '.repeat(Math.max(0, errorLoc.column - 2))} ^ ${firstMessageLine}`,
    );
  }
  return frame.join('\n');
}

/**
 * Build error-context markdown for bridge-mode test failures.
 *
 * Adapted from Playwright's own `buildErrorContext` in
 * playwright/lib/errorContext.js (Apache 2.0 licensed by Microsoft).
 * Matches the format Playwright 1.53+ generates for "Fix with AI" integration.
 */
export function buildBridgeErrorContext(testName: string, filePath: string, errorMessage: string, options: BridgeErrorContextOptions = {}): string {
  const { workspaceFolder, pageSnapshot, useCodeFences = false, fallbackLine } = options;
  const relativePath = path.relative(workspaceFolder || path.dirname(filePath), filePath);
  const parsedLoc = parseErrorLocation(errorMessage, filePath);
  const errorLoc = parsedLoc || (fallbackLine !== undefined ? { line: fallbackLine, column: 1 } : undefined);
  const locationString = errorLoc ? `${relativePath}:${errorLoc.line}:${errorLoc.column}` : relativePath;
  const cleanError = stripAnsi(errorMessage || '');

  const lines: string[] = [
    '# Instructions',
    '',
    '- Following Playwright test failed.',
    '- Explain why, be concise, respect Playwright best practices.',
    '- Provide a snippet of code with the fix, if possible.',
    '',
    '# Test info',
    '',
    `- Name: ${relativePath} >> ${testName}`,
    `- Location: ${locationString}`,
    '',
    '# Error details',
    '',
  ];

  if (useCodeFences)
    lines.push('```', cleanError, '```');
  else
    lines.push(cleanError);

  if (pageSnapshot) {
    lines.push('', '# Page snapshot', '');
    if (useCodeFences)
      lines.push('```yaml', pageSnapshot, '```');
    else
      lines.push(pageSnapshot);
  }

  if (errorLoc) {
    const codeFrame = buildCodeFrame(filePath, errorLoc, errorMessage);
    if (codeFrame) {
      lines.push('', '# Test source', '');
      if (useCodeFences) lines.push('```ts');
      lines.push(codeFrame);
      if (useCodeFences) lines.push('```');
    }
  } else {
    // No error location — fall back to including the full source with line numbers
    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      lines.push('', '# Test source', '');
      if (useCodeFences) lines.push('```ts');
      const sourceLines = source.split('\n');
      const lineNumberWidth = String(sourceLines.length).length;
      for (let i = 0; i < sourceLines.length; i++)
        lines.push(`  ${(i + 1).toString().padEnd(lineNumberWidth, ' ')} | ${sourceLines[i]}`);
      if (useCodeFences) lines.push('```');
    } catch {
      // File not readable — skip source section
    }
  }

  return lines.join('\n');
}

/**
 * Write error-context markdown to test-results directory for inspection and CI artifacts.
 */
export function writeBridgeErrorContext(testName: string, workspaceFolder: string, aiContext: string): void {
  try {
    const safeName = testName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
    const dir = path.join(workspaceFolder, 'test-results', safeName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'error-context.md'), aiContext);
  } catch {
    // Best-effort — don't break test reporting if write fails
  }
}

// See uriToPath for details.
export function normalizePath(fsPath: string): string {
  if (process.platform === 'win32' && fsPath?.length && fsPath[0] !== '/' && fsPath[0] !== '\\')
    return fsPath[0].toUpperCase() + fsPath.substring(1);
  return fsPath;
}
