/**
 * Shim for the 'vscode' module in test builds.
 *
 * Our recorder.ts and picker.ts do `import * as vscode from 'vscode'`
 * which fails outside VS Code. This shim provides a global proxy that
 * gets populated when the mock VSCode instance is created in tests.
 *
 * TODO: Phase 1 should refactor recorder/picker to accept vscode as
 * a parameter (like upstream does), eliminating the need for this shim.
 */

const vscodeProxy: Record<string, any> = new Proxy({} as any, {
  get(_target, prop) {
    const g = (globalThis as any).__vscodeShim;
    if (g && prop in g) return g[prop];
    // Return a no-op for properties not yet set (module load time)
    return undefined;
  },
});

module.exports = vscodeProxy;
