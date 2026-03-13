export type OutputLine = {
    text: string
    type: 'command' | 'success' | 'error' | 'info' | 'comment' | 'snapshot' | 'code-block' | 'screenshot'
    image?: string
    value?: unknown
    getProperties?: (objectId: string) => Promise<unknown>
    pickResult?: PickResultData
}

export type PickResultData = {
    locator: string;           // "page.getByRole('button', { name: 'Submit' })"
    pwCommand: string | null;  // 'click "Submit"' or null if not expressible
    jsExpression: string;      // "await page.getByRole('button', { name: 'Submit' }).click()"
    details?: {
        tag: string;
        text: string;
        html: string;
        visible: boolean;
        enabled: boolean;
        count: number;
        attributes: Record<string, string>;
        box?: { x: number; y: number; width: number; height: number };
    };
}

export type ElementPickInfo = {
    locator: string;
    pwLocator?: string | null;
    tag: string;
    text: string;
    html: string;
    attributes: Record<string, string>;
    visible: boolean;
    enabled: boolean;
    box: { x: number; y: number; width: number; height: number };
}

export type CommandResult = {
    text: string
    isError: boolean
    image?: string
}

export type RecordedMessage =
    | { type: 'pw-recorded-command'; command: string }
    | { type: 'pw-tab-activated'; url: string };