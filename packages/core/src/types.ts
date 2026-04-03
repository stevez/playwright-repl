// ─── Engine types (shared across packages) ──────────────────────────────────

export interface EngineOpts {
  headed?: boolean;
  browser?: string;
  connect?: number | boolean;
  spawn?: boolean;
  port?: number;
  cdpPort?: number;
  persistent?: boolean;
  profile?: string;
  cwd?: string;
  [key: string]: unknown;
}

export interface EngineResult {
  text?: string;
  image?: string;
  isError?: boolean;
}

export interface ParsedArgs {
  _: string[];
  cwd?: string;
  nth?: string | number;
  [key: string]: unknown;
}
