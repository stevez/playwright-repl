import { ObjectTree } from './ObjectTree';
import type { ConsoleEntry as Entry } from './types';

export function ConsoleEntry({ entry }: { entry: Entry }) {
    return (
        <div className="py-0.5 pb-1 border-b border-(--border-primary) last:border-b-0" data-status={entry.status}>

            {/* Input line(s) */}
            {entry.input.split('\n').map((line, i) => (
                <div key={i} className="flex items-baseline gap-1">
                    <span className="text-(--color-prompt) shrink-0">{i === 0 ? '>' : ' '}</span>
                    <span className="flex-1 text-(--color-command)">{line}</span>
                </div>
            ))}

            {/* Result */}
            {entry.status === 'pending' && (
                <div className="pl-4 text-(--text-dim)">…</div>
            )}

            {entry.status === 'done' && (
                <div className="pl-4 pt-0.5">
                    {entry.value !== undefined ? (
                        <ObjectTree data={entry.value} />
                    ) : (
                        <span className="text-(--color-success)">{entry.text}</span>
                    )}
                </div>
            )}

            {entry.status === 'error' && (
                <div className="pl-4 pt-0.5 text-(--color-error)">{entry.errorText}</div>
            )}

        </div>
    );
}
