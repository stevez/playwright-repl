import type { EngineResult } from '@playwright-repl/core';

export interface Runner {
    runCommand(command: string): Promise<EngineResult>;
    runScript(script: string, language: 'pw' | 'javascript'): Promise<EngineResult>;
}

export interface RunnerDescriptions {
    runCommandInput: string;
    runCommand: string;
    runScript: string;
    /** When true, run_script only accepts 'script' param (no 'language'). */
    scriptOnly: boolean;
}

export interface RunnerModule {
    runner: Runner;
    descriptions: RunnerDescriptions;
}

export interface SnapshotCache {
    value: { url: string; snapshotString: string } | null;
}
