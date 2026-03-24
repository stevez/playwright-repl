/**
 * Load playwright.config.ts
 */

import path from 'node:path';
import type { PlaywrightConfig } from './types.js';

export async function loadConfig(configPath: string): Promise<PlaywrightConfig> {
  const absPath = path.resolve(configPath);

  try {
    const mod = await import(absPath);
    return mod.default || mod;
  } catch {
    // No config file — use defaults
    return {};
  }
}
