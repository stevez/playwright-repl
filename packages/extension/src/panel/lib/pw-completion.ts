import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { COMMAND_NAMES } from './commands';

const completions = COMMAND_NAMES.map(name => ({ label: name }));

export function pwCompletion(context: CompletionContext): CompletionResult | null {
  // Only complete the first word on a line
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = context.state.sliceDoc(line.from, context.pos);
  if (textBefore.trimStart().includes(' ')) return null;  // cursor is past the command

  const word = context.matchBefore(/[\w-]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const prefix = word.text.toLowerCase();
  const filtered = prefix ? completions.filter(c => c.label.startsWith(prefix)) : completions;

  return {
    from: word.from,
    options: filtered,
    validFor: /^[\w-]*$/,
  };
}
