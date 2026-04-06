import { useState } from 'react';
import { ObjectTree } from './ObjectTree';
import { SnapshotTree } from './SnapshotTree';
import { pickResultToSerialized } from '@/lib/pick-info';
import { parseSnapshot } from '@/lib/snapshot-parser';
import Lightbox from '../Lightbox';
import { saveToFile } from '@/lib/file-utils';
import type { ConsoleEntry as Entry } from './types';

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ConsoleEntry({ entry }: { entry: Entry }) {
    const [lightbox, setLightbox] = useState(false);

    return (
        <div className="flex items-start gap-1 py-0.5 pb-1 border-b border-(--border-primary) last:border-b-0" data-status={entry.status}>
            <span className="text-(--color-prompt) shrink-0">{'>'}</span>
            <div className="flex-1 min-w-0">
                {entry.input.split('\n').map((line, i, arr) => (
                    <div key={i} className="text-(--color-command)">
                        {line}
                        {i === arr.length - 1 && entry.time !== undefined && localStorage.getItem('logTime') === 'true' && (
                            <span className="text-(--text-dim) text-[10px]"> : {entry.time}ms</span>
                        )}
                    </div>
                ))}
                {entry.status === 'pending' && (
                    <div className="text-(--text-dim) pt-0.5">…</div>
                )}
                {entry.status === 'done' && (
                    <div className="pt-0.5">
                        {entry.pickResult !== undefined ? (
                            <div data-type="pick-result">
                                <ObjectTree
                                    data={pickResultToSerialized(entry.pickResult)}
                                    noQuote
                                    extraChildren={entry.pickResult.ariaSnapshot ? (
                                        <div className="ot-row">
                                            <div>
                                                <span className="ot-key">aria</span><span className="ot-colon">: </span>
                                            </div>
                                            <div className="w-full mt-0.5 border border-solid border-(--border-primary) rounded-sm bg-(--bg-line-highlight)">
                                                <pre className="m-0 py-2 px-3 text-(--color-command) font-[inherit] text-[12px] leading-4 whitespace-pre-wrap wrap-break-word">{entry.pickResult.ariaSnapshot}</pre>
                                            </div>
                                        </div>
                                    ) : undefined}
                                />
                            </div>
                        ) : entry.value !== undefined ? (
                            <div data-type="success"><ObjectTree data={entry.value} getProperties={entry.getProperties} /></div>
                        ) : entry.codeBlock !== undefined ? (
                            <SnapshotCodeBlock codeBlock={entry.codeBlock} />
                        ) : entry.video !== undefined ? (
                            <div data-type="video" className="flex items-center gap-2 py-1">
                                <span className="text-(--color-success)">Video recorded{entry.videoDuration !== undefined ? ` (${formatDuration(entry.videoDuration)}, ${formatSize(entry.videoSize ?? 0)})` : ''}</span>
                                <button
                                    className="bg-(--bg-button) text-(--text-default) border border-solid border-(--border-button) rounded-[3px] py-[2px] px-2 font-[inherit] text-[11px] cursor-pointer hover:bg-(--bg-button-hover)"
                                    onClick={() => chrome.runtime.sendMessage({ type: 'video-preview', blobUrl: entry.video })}
                                >Preview</button>
                                <button
                                    className="bg-(--bg-button) text-(--text-default) border border-solid border-(--border-button) rounded-[3px] py-[2px] px-2 font-[inherit] text-[11px] cursor-pointer hover:bg-(--bg-button-hover)"
                                    onClick={() => chrome.runtime.sendMessage({ type: 'video-save', blobUrl: entry.video })}
                                >Save Video</button>
                            </div>
                        ) : entry.image !== undefined ? (
                            entry.image.startsWith('data:application/pdf') ? (
                                <div data-type="pdf" className="flex items-center gap-2 py-1">
                                    <span className="text-(--color-success)">PDF generated</span>
                                    <button
                                        className="bg-(--bg-button) text-(--text-default) border border-solid border-(--border-button) rounded-[3px] py-[2px] px-2 font-[inherit] text-[11px] cursor-pointer hover:bg-(--bg-button-hover)"
                                        onClick={() => saveToFile(entry.image!)}
                                    >Save PDF</button>
                                </div>
                            ) : (
                                <div data-type="screenshot">
                                    <img
                                        src={entry.image}
                                        className="max-w-100 cursor-zoom-in rounded"
                                        onClick={() => setLightbox(true)}
                                    />
                                    {lightbox && <Lightbox image={entry.image} onClose={() => setLightbox(false)} />}
                                </div>
                            )
                        ) : (
                            <div data-type="success" className="whitespace-pre-wrap text-(--color-success)">{entry.text}</div>
                        )}
                    </div>
                )}
                {entry.status === 'error' && (
                    <div data-type="error" className="pt-0.5 text-(--color-error) whitespace-pre-wrap">
                        {entry.value !== undefined ? (
                            <ObjectTree data={entry.value} />
                        ) : entry.errorText}
                    </div>
                )}
            </div>
        </div>
    );
}

function SnapshotCodeBlock({ codeBlock }: { codeBlock: string }) {
    const node = codeBlock.trimStart().startsWith('- ') ? parseSnapshot(codeBlock) : null;
    return (
        <div data-type="snapshot" className="relative border border-solid border-(--border-primary) rounded-[4px] my-[6px] mx-0 bg-(--bg-line-highlight)">
            {node
                ? <div className="py-2 px-3"><SnapshotTree node={node} depth={0} /></div>
                : <pre className="m-0 py-2 px-3 text-(--color-command) font-[inherit] text-[12px] leading-4 whitespace-pre-wrap wrap-break-word">{codeBlock}</pre>
            }
            <button
                className="absolute top-1 right-1 bg-(--bg-button) text-(--text-default) border border-solid border-(--border-button) rounded-[3px] py-[2px] px-2 font-[inherit] text-[10px] cursor-pointer hover:bg-(--bg-button-hover)"
                onClick={() => navigator.clipboard.writeText(codeBlock)}
            >Copy</button>
        </div>
    );
}
