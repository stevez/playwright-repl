export type OutputLine = {
    text: string
    type: 'command' | 'success' | 'error' | 'info' | 'comment' | 'snapshot' | 'code-block' | 'screenshot'
    image?: string
    value?: unknown
    getProperties?: (objectId: string) => Promise<unknown>
}

export type CommandResult = {
    text: string
    isError: boolean
    image?: string
}

export type RecordedMessage =
    | { type: 'pw-recorded-command'; command: string }
    | { type: 'pw-tab-activated'; url: string };