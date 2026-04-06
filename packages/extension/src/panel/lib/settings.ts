export type PwReplSettings = {
    openAs: 'sidepanel' | 'popup',
    bridgePort: number,
    languageMode: 'pw' | 'js',
};

const DEFAULT: PwReplSettings = { openAs: 'sidepanel', bridgePort: 9876, languageMode: 'pw' };

export async function loadSettings(): Promise<PwReplSettings> {
    const stored = await chrome.storage.local.get(['openAs', 'bridgePort', 'languageMode']) as Partial<PwReplSettings>;
    return { ...DEFAULT, ...stored };
}

export async function storeSettings(s: PwReplSettings): Promise<void> {
    await chrome.storage.local.set(s);
}