import { useState } from 'react';
import { ObjectTree } from './ObjectTree';
import Lightbox from '../Lightbox';
import type { ConsoleEntry as Entry } from './types';

export function ConsoleEntry({ entry }: { entry: Entry }) {
    const [lightbox, setLightbox] = useState(false);

    return (
        <div className="flex items-start gap-1 py-0.5 pb-1 border-b border-(--border-primary) last:border-b-0" data-status={entry.status}>
            <span className="text-(--color-prompt) shrink-0">{'>'}</span>
            <div className="flex-1 min-w-0">
                {entry.input.split('\n').map((line, i) => (
                    <div key={i} className="text-(--color-command)">{line}</div>
                ))}
                {entry.status === 'pending' && (
                    <div className="text-(--text-dim) pt-0.5">…</div>
                )}
                {entry.status === 'done' && (
                    <div className="pt-0.5">
                        {entry.value !== undefined ? (
                            <div data-type="success"><ObjectTree data={entry.value} getProperties={entry.getProperties} /></div>
                        ) : entry.codeBlock !== undefined ? (
                            <div data-type="snapshot" className="relative border border-solid border-(--border-primary) rounded-[4px] my-[6px] mx-0 bg-(--bg-line-highlight)">
                                <pre className="m-0 py-2 px-3 text-(--color-command) font-[inherit] text-[12px] leading-4 whitespace-pre-wrap wrap-break-word">{entry.codeBlock}</pre>
                                <button
                                    className="absolute top-1 right-1 bg-(--bg-button) text-(--text-default) border border-solid border-(--border-button) rounded-[3px] py-[2px] px-2 font-[inherit] text-[10px] cursor-pointer hover:bg-(--bg-button-hover)"
                                    onClick={() => navigator.clipboard.writeText(entry.codeBlock!)}
                                >Copy</button>
                            </div>
                        ) : entry.image !== undefined ? (
                            <div data-type="screenshot">
                                <img
                                    src={entry.image}
                                    className="max-w-100 cursor-zoom-in rounded"
                                    onClick={() => setLightbox(true)}
                                />
                                {lightbox && <Lightbox image={entry.image} onClose={() => setLightbox(false)} />}
                            </div>
                        ) : (
                            <div data-type="success" className="whitespace-pre-wrap text-(--color-success)">{entry.text}</div>
                        )}
                    </div>
                )}
                {entry.status === 'error' && (
                    <div data-type="error" className="pt-0.5 text-(--color-error) whitespace-pre-wrap">{entry.errorText}</div>
                )}
            </div>
        </div>
    );
}
