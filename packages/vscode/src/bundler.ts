/**
 * Test Bundler
 *
 * Uses esbuild to prepare a .spec.ts file for bridge execution:
 * 1. Compiles TypeScript → JavaScript
 * 2. Bundles all imports into a single script
 * 3. Aliases @playwright/test → our test-runner shim
 * 4. Appends __runTests() call to execute the tests
 * 5. Optionally includes inline source maps for debugging
 *
 * Returns a JS string ready to send through the bridge.
 */

import path from 'node:path';

// __filename is available at runtime in esbuild's CJS output
declare const __filename: string;

export interface BundleOptions {
  debug?: boolean;  // include source maps + sourceURL for debugging
}

// Maps bundled line (0-based) → original source line (0-based)
export type SourceLineMap = Map<number, number>;

export interface BundleResult {
  script: string;
  lineMap: SourceLineMap;
}

export async function bundleTestFile(testFilePath: string, opts?: BundleOptions): Promise<string>;
export async function bundleTestFile(testFilePath: string, opts: BundleOptions & { debug: true }): Promise<BundleResult>;
export async function bundleTestFile(testFilePath: string, opts: BundleOptions = {}): Promise<string | BundleResult> {
  // Dynamic import — esbuild is a devDependency
  const esbuild = await import('esbuild');

  const shimPath = path.resolve(path.dirname(__filename), '../src/shim/test-runner.ts');
  const fileName = path.basename(testFilePath);
  const fileNameNoExt = fileName.replace(/\.[^.]+$/, '');

  const result = await esbuild.build({
    entryPoints: [testFilePath],
    bundle: true,
    write: false,
    format: 'iife',          // plain script — no import/export (runs in eval)
    globalName: '__tests',    // wraps in IIFE, exposes __runTests via __tests
    platform: 'browser',
    sourcemap: opts.debug ? 'inline' : false,
    alias: {
      '@playwright/test': shimPath,
    },
    // Don't fail on Node.js built-ins — just leave them as external
    // (they'll error at runtime if actually used, which is expected)
    external: ['fs', 'path', 'child_process', 'os', 'crypto', 'util', 'stream', 'events', 'net', 'http', 'https'],
  });

  let bundledCode = result.outputFiles[0].text;

  // sourceURL must differ from the source map source paths, otherwise
  // setBreakpointByUrl matches the bundled script instead of the source-mapped file.
  if (opts.debug) {
    bundledCode += `\n//# sourceURL=pw-ide-bundle-${Date.now()}\n`;
  }

  // The IIFE registers all tests + sets globalThis.__runTests.
  // Append the call to execute them.
  const script = `${bundledCode}\nawait globalThis.__runTests();\n`;

  if (opts.debug) {
    const lineMap = parseInlineSourceMap(bundledCode, fileNameNoExt);
    return { script, lineMap };
  }

  return script;
}

// ─── Source Map Parsing ────────────────────────────────────────────────────

function parseInlineSourceMap(code: string, testFileName: string): SourceLineMap {
  const map = new Map<number, number>();
  const match = code.match(/\/\/# sourceMappingURL=data:application\/json;base64,(.+)/);
  if (!match) return map;

  const sm = JSON.parse(Buffer.from(match[1], 'base64').toString());
  const testSourceIdx = sm.sources.findIndex((s: string) => s.includes(testFileName));
  if (testSourceIdx === -1) return map;

  // Decode VLQ mappings
  const VLQ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function decodeVLQ(str: string): number[] {
    const result: number[] = [];
    let shift = 0, value = 0;
    for (const c of str) {
      const digit = VLQ.indexOf(c);
      value += (digit & 31) << shift;
      if (digit < 32) {
        result.push(value & 1 ? -(value >> 1) : value >> 1);
        value = shift = 0;
      } else { shift += 5; }
    }
    return result;
  }

  let srcIdx = 0, srcLine = 0, srcCol = 0;
  const lines = (sm.mappings as string).split(';');
  for (let i = 0; i < lines.length; i++) {
    const segments = lines[i].split(',').filter(Boolean);
    for (const seg of segments) {
      const d = decodeVLQ(seg);
      if (d.length >= 4) {
        srcIdx += d[1]; srcLine += d[2]; srcCol += d[3];
        if (srcIdx === testSourceIdx && !map.has(i)) {
          map.set(i, srcLine);
        }
      }
    }
  }
  return map;
}
