// ─── Window extensions ───────────────────────────────────────────────────────

interface Window {
  __pwRecorderCleanup?: () => void;
}

// ─── vitest-chrome (no published types) ──────────────────────────────────────

declare module "vitest-chrome/lib/index.esm.js" {
  const chrome: typeof globalThis.chrome;
  export = chrome;
}

// ─── Core package stubs (temporary until @playwright-repl/core exports types) ─

declare module "../core/src/engine.mjs" {
  export class Engine {
    start(opts: Record<string, unknown>): Promise<void>;
    close(): Promise<void>;
  }
}

declare module "../core/src/extension-server.mjs" {
  export class CommandServer {
    constructor(engine: unknown);
    port: number;
    start(port: number): Promise<void>;
    close(): Promise<void>;
  }
}
