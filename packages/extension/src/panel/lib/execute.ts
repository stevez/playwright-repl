import { COMMAND_NAMES } from '@/lib/commands';

const PW_COMMANDS = new Set(COMMAND_NAMES);

/** Playwright globals available in the SW context — bare words that should evaluate, not parse as commands. */
const PW_GLOBALS = new Set(['page', 'context', 'expect', 'crxApp', 'activeTabId']);

/**
 * Resolve the execution mode for console input.
 * Multi-line input always runs in the SW context (AsyncFunction supports await).
 */
export function resolveConsoleMode(input: string): 'playwright' | 'pw' {
    if (input.includes('\n')) return 'playwright';
    return detectMode(input);
}

export function detectMode(input: string): 'playwright' | 'pw' {
    const t = input.trim();
    const firstToken = t.split(/\s+/)[0];
    if (PW_COMMANDS.has(firstToken.toLowerCase())) return 'pw';
    // Playwright globals (page, context, expect, etc.) → evaluate in SW context
    if (PW_GLOBALS.has(firstToken)) return 'playwright';
    // Bare words that look like commands → 'pw' so unknown ones show parse errors
    if (/^[a-z][\w-]*$/.test(firstToken) && !/[.()[\]=+`$;{}"']/.test(t)) return 'pw';
    return 'playwright';
}
