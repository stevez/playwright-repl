export type OutputLine = {
    text: string
    type: 'command' | 'success' | 'error' | 'info' | 'comment' | 'snapshot' | 'code-block' | 'screenshot'
    time?: number
    image?: string
    video?: string
    videoDuration?: number
    videoSize?: number
    trace?: boolean
    traceSize?: number
    value?: unknown
    getProperties?: (objectId: string) => Promise<unknown>
    pickResult?: PickResultData
}

export type PickResultData = {
    locator: string;           // "page.getByRole('button', { name: 'Submit' })"
    pwCommand: string | null;  // 'highlight "Submit"' or null if not expressible
    jsExpression: string;      // "await page.getByRole('button', { name: 'Submit' }).highlight()"
    assertJs?: string;         // "await expect(page.getByRole('button', { name: 'Submit' })).toContainText('Submit')"
    assertPw?: string;         // 'verify-text "Submit"'
    ariaSnapshot?: string;     // YAML aria snapshot of the picked element
    details?: {
        tag: string;
        text: string;
        html: string;
        visible: boolean;
        enabled: boolean;
        count: number;
        attributes: Record<string, string>;
        box?: { x: number; y: number; width: number; height: number };
        value?: string;
        checked?: boolean;
    };
}

export type ElementPickInfo = {
    locator: string;
    tag: string;
    text: string;
    html: string;
    attributes: Record<string, string>;
    visible: boolean;
    enabled: boolean;
    box: { x: number; y: number; width: number; height: number };
    value?: string;
    checked?: boolean;
}

export type CommandResult = {
    text: string
    isError: boolean
    image?: string
}

export type RecordedMessage =
    | { type: 'pw-recorded-command'; command: string }
    | { type: 'pw-tab-activated'; url: string };