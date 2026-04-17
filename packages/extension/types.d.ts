// ─── Window extensions ───────────────────────────────────────────────────────

interface Window {
  __pwRecorderCleanup?: () => void;
  showSaveFilePicker(options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }): Promise<FileSystemFileHandle>;
}

// ─── File System Access API (not in default DOM types) ───────────────────────

interface FileSystemFileHandle {
  name: string;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: Blob | string | ArrayBuffer): Promise<void>;
  close(): Promise<void>;
}

// ─── Chrome Extension APIs (missing from @types/chrome) ─────────────────────

declare namespace chrome {
  namespace sidePanel {
    function setPanelBehavior(options: { openPanelOnActionClick: boolean }): void;
  }

  namespace scripting {
    interface ScriptInjection {
      target: { tabId: number; allFrames?: boolean };
      files?: string[];
      func?: () => void;
    }
    function executeScript(injection: ScriptInjection): Promise<unknown>;
  }
}

// ─── nextcov (no published types) ────────────────────────────────────────────

declare module "nextcov/playwright" {
  import type { Page, TestInfo } from '@playwright/test';
  export function collectClientCoverage(
    page: Page,
    testInfo: TestInfo,
    use: () => Promise<void>,
    config?: { transformUrl?: (url: string) => string; [key: string]: unknown },
  ): Promise<void>;
  export function initCoverage(config: unknown): Promise<void>;
  export function finalizeCoverage(config: unknown): Promise<void>;
  export function loadNextcovConfig(configPath: string): Promise<unknown>;
}

declare module "nextcov" {
  export interface NextcovConfig {
    outputDir?: string;
    sourceRoot?: string;
    collectServer?: boolean;
    include?: string[];
    exclude?: string[];
    reporters?: string[];
    [key: string]: unknown;
  }
}

// ─── vitest-chrome (no published types) ──────────────────────────────────────

declare module "vitest-chrome/lib/index.esm.js" {
  const chrome: typeof globalThis.chrome;
  export = chrome;
}
