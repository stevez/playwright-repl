/**
 * CLI argument parser.
 * Matches Playwright Test's argument format.
 */

export interface CliOptions {
  config: string;
  grep?: string;
  headed: boolean;
  forceNode?: boolean;
  workers?: number;
  timeout?: number;
  retries?: number;
  filter?: string[]; // positional test file/name filters
}

export function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    config: 'playwright.config.ts',
    headed: false,
  };
  const filter: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-c':
      case '--config':
        opts.config = args[++i];
        break;
      case '-g':
      case '--grep':
        opts.grep = args[++i];
        break;
      case '--headed':
        opts.headed = true;
        break;
      case '--node':
        opts.forceNode = true;
        break;
      case '-j':
      case '--workers':
        opts.workers = parseInt(args[++i], 10);
        break;
      case '--timeout':
        opts.timeout = parseInt(args[++i], 10);
        break;
      case '--retries':
        opts.retries = parseInt(args[++i], 10);
        break;
      default:
        if (!arg.startsWith('-')) {
          filter.push(arg);
        }
    }
  }

  if (filter.length > 0) opts.filter = filter;
  return opts;
}
