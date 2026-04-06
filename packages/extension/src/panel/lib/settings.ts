export type PwReplSettings = {
    openAs: 'sidepanel' | 'popup',
    bridgePort: number,
    cdpRelayPort: number,
    languageMode: 'pw' | 'js',
};

const DEFAULT: PwReplSettings = { openAs: 'sidepanel', bridgePort: 9876, cdpRelayPort: 9877, languageMode: 'pw' };

export async function loadSettings(): Promise<PwReplSettings> {
    const stored = await chrome.storage.local.get(['openAs', 'bridgePort', 'cdpRelayPort', 'languageMode']) as Partial<PwReplSettings>;
    return { ...DEFAULT, ...stored };
}

export async function storeSettings(s: PwReplSettings): Promise<void> {
    await chrome.storage.local.set(s);
}