// ─── Global extensions (background.ts, test-framework.ts, recorder.ts) ──────
// These are ambient declarations (script-context .d.ts) — no `declare global` needed.

// Page observation globals set by attachToTab() in background.ts
declare var __consoleMessages: string[];
declare var __networkRequests: Array<{ status: number; method: string; url: string; type: string }>;
declare var __activeRoutes: string[];
declare var __dialogMode: 'accept' | 'dismiss' | undefined;
declare var __downloadFilename: string | undefined;
declare var downloadAs: (filename: string) => void;

// Exposed on globalThis for serviceWorker.evaluate() / VS Code CDP injection
declare var attachToTab: (tabId: number) => Promise<{ ok: boolean; url?: string; error?: string }>;
declare var handleBridgeCommand: (msg: { command: string; scriptType?: 'command' | 'script'; language?: 'pw' | 'javascript'; includeSnapshot?: boolean }) => Promise<{ text: string; isError: boolean; image?: string }>;

// Test framework globals (test-framework.ts -> installFramework)
declare var __test: unknown;
declare var __expect: (target: unknown) => unknown;
declare var __runTests: () => Promise<string>;
declare var __resetTestState: () => void;
declare var __setGrep: (pattern: string | null) => void;
declare var __setGrepExact: (pattern: string | null) => void;
declare var __setTimeout: (ms: number) => void;
declare var __proxyPage: unknown;
declare var __proxyExpect: unknown;

// ─── Window extensions ───────────────────────────────────────────────────────

interface Window {
  __pwRecorderCleanup?: () => void;
  __pw_recorder_active?: boolean;
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
    function open(options: { windowId?: number }): Promise<void>;
  }

  namespace scripting {
    interface ScriptInjection {
      target: { tabId: number; allFrames?: boolean };
      files?: string[];
      func?: () => void;
    }
    function executeScript(injection: ScriptInjection): Promise<unknown>;
  }

  namespace offscreen {
    function hasDocument(): Promise<boolean>;
    function createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
    const Reason: { BLOBS: string; USER_MEDIA: string };
  }

  namespace management {
    function getSelf(): Promise<{ installType: string }>;
  }

  namespace action {
    const onClicked: { addListener: (callback: (tab: { id?: number; url?: string; windowId?: number }) => void) => void };
  }

  namespace tabCapture {
    function getMediaStreamId(options: { targetTabId?: number }): Promise<string>;
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
