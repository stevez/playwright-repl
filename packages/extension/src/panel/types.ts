export type OutputLine = {
    text: string
    type: 'command' | 'success' | 'error' | 'info' | 'comment' | 'snapshot'
}

export type CommandResult = {
    text: string
    isError: boolean
    image?: string
}

export type RecordedMessage = { type: 'pw-recorded-command'; command: string };