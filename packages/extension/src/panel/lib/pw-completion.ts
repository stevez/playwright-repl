import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { COMMAND_NAMES, ALIASES } from './commands';

const completions = [
  ...COMMAND_NAMES.map(name => ({ label: name })),
  ...ALIASES.map(alias => ({ label: alias })),
];

export function pwCompletion(context: CompletionContext): CompletionResult | null {
  // Only complete the first word on a line
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = context.state.sliceDoc(line.from, context.pos);
  if (textBefore.trimStart().includes(' ')) return null;  // cursor is past the command

  const word = context.matchBefore(/[\w-]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  return {
    from: word.from,
    options: completions,
    validFor: /^[\w-]*$/,
  };
}
