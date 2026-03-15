import { COMMAND_NAMES } from '@/lib/commands';

const PW_COMMANDS = new Set(COMMAND_NAMES);

/**
 * Resolve the execution mode for console input.
 * Multi-line input always runs as JS (AsyncFunction supports await).
 */
export function resolveConsoleMode(input: string): 'js' | 'pw' {
    if (input.includes('\n')) return 'js';
    return detectMode(input);
}

/** Only known PW commands run in pw mode; everything else is JS. */
export function detectMode(input: string): 'js' | 'pw' {
    const firstToken = input.trim().split(/\s+/)[0];
    if (PW_COMMANDS.has(firstToken.toLowerCase())) return 'pw';
    return 'js';
}
