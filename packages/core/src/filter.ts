/**
 * Filters verbose Playwright MCP responses down to the essential sections.
 *
 * Keeps: Result, Error, Modal state, Snapshot (only for `snapshot` command,
 * or for update commands when `includeSnapshot` is on).
 * Strips: "Ran Playwright code", "Open tabs", "Page", "Events", etc.
 */

import { UPDATE_COMMANDS } from './resolve.js';

export interface FilterOptions {
  /** When true, keep Snapshot sections for update commands. Set at server startup for MCP mode. */
  includeSnapshot?: boolean;
}

export function filterResponse(text: string, cmdName?: string, opts?: FilterOptions): string {
  const sections = text.split(/^### /m).slice(1);
  if (sections.length === 0) return text.trim();

  const keepSnapshot = cmdName === 'snapshot'
    || (opts?.includeSnapshot === true && cmdName !== undefined && UPDATE_COMMANDS.has(cmdName));

  const kept: string[] = [];
  for (const section of sections) {
    const nl = section.indexOf('\n');
    if (nl === -1) continue;
    const title = section.substring(0, nl).trim();
    const content = section.substring(nl + 1).trim();
    if (title === 'Snapshot' && !keepSnapshot) continue;
    if (title === 'Result' || title === 'Error' || title === 'Modal state' || title === 'Snapshot')
      kept.push(`### ${title}\n${content}`);
  }
  return kept.length > 0 ? kept.join('\n') : '';
}
