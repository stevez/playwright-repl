import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { StringStream } from '@codemirror/language';
import { COMMAND_NAMES } from './commands';

const COMMANDS = new Set(COMMAND_NAMES);

interface PwState {
  commandSeen: boolean;
}

function token(stream: StringStream, state: PwState): string | null {
  if (stream.sol()) state.commandSeen = false;

  if (stream.eatSpace()) return null;

  // Comments: # to end of line (only before command)
  if (!state.commandSeen && stream.peek() === '#') {
    stream.skipToEnd();
    return 'comment';
  }

  // Command: first word on the line
  if (!state.commandSeen) {
    const word = stream.match(/^[\w-]+/) as RegExpMatchArray | null;
    if (word) {
      state.commandSeen = true;
      if (COMMANDS.has(word[0])) return 'keyword';
    }
    return null;
  }

  // Quoted strings: "..." or '...'
  const ch = stream.peek();
  if (ch === '"' || ch === "'") {
    const quote = stream.next();
    while (!stream.eol()) {
      const c = stream.next();
      if (c === '\\') stream.next();
      else if (c === quote) break;
    }
    return 'string';
  }

  // Flags: --word
  if (stream.match(/^--[\w-]+/)) return 'attributeName';

  // URLs: http:// or https://
  if (stream.match(/^https?:\/\/\S+/)) return 'url';

  // Everything else
  stream.next();
  return null;
}

export const pwLanguage = StreamLanguage.define<PwState>({
  startState: () => ({ commandSeen: false }),
  token,
});

const pwHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword,       color: 'var(--color-command)' },
  { tag: tags.comment,       color: 'var(--color-comment)', fontStyle: 'italic' },
  { tag: tags.string,        color: 'var(--color-string)' },
  { tag: tags.attributeName, color: 'var(--color-flag)' },
  { tag: tags.url,           color: 'var(--color-url)', textDecoration: 'underline' },
]);

export const pwSyntax = [
  pwLanguage,
  syntaxHighlighting(pwHighlightStyle),
];
