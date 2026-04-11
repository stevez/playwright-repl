// ─── nextcov (no published types) ────────────────────────────────────────────

declare module "nextcov/playwright" {
  import type { Page, TestInfo } from '@playwright/test';
  export function collectClientCoverage(
    page: Page,
    testInfo: TestInfo,
    use: () => Promise<void>,
    config?: { transformUrl?: (url: string) => string; [key: string]: unknown },
  ): Promise<void>;
  export function saveClientCoverage(testId: string, coverage: unknown[]): Promise<void>;
  export function filterAppCoverage(entries: unknown[]): unknown[];
  export function initCoverage(config: unknown): Promise<void>;
  export function finalizeCoverage(config: unknown): Promise<void>;
  export function loadNextcovConfig(configPath?: string): Promise<unknown>;
}

declare module "nextcov" {
  export interface NextcovConfig {
    outputDir?: string;
    sourceRoot?: string;
    collectServer?: boolean;
    collectClient?: boolean;
    include?: string[];
    exclude?: string[];
    reporters?: string[];
    [key: string]: unknown;
  }
}
