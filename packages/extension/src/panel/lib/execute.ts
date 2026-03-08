import { COMMAND_NAMES } from '@/lib/commands';

const PW_COMMANDS = new Set(COMMAND_NAMES);

export function detectMode(input: string): 'playwright' | 'js' | 'pw' {
    const t = input.trim();
    const firstToken = t.split(/\s+/)[0].toLowerCase();
    if (PW_COMMANDS.has(firstToken)) return 'pw';
    if (t === 'page' || t.startsWith('page.') || t.startsWith('page[') ||
        t.startsWith('await page') ||
        t === 'expect' || t.startsWith('expect(') || t.startsWith('await expect(') ||
        t === 'crxApp' || t.startsWith('crxApp.') ||
        t === 'context' || t.startsWith('context.') || t.startsWith('await context') ||
        t === 'activeTabId') return 'playwright';
    if (/^[a-z][\w-]*$/.test(firstToken) && !/[.()[\]=+`$;{}"']/.test(t)) return 'pw';
    return 'js';
}
