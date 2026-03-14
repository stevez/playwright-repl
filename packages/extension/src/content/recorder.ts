/**
 * Recorder content script.
 * Injected into the active tab via chrome.scripting.executeScript.
 * Captures DOM events, generates locator + PW/JS commands, sends to panel.
 *
 * Transparent: never calls preventDefault/stopPropagation — user actions flow normally.
 */
import { generateLocator, escapeString } from './locator';

(function () {
    // Guard against double-injection
    if ((window as any).__pw_recorder_active) return;
    (window as any).__pw_recorder_active = true;

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** Quote a string for PW keyword commands */
    const q = (s: string) => `"${s}"`;

    /**
     * Parse a JS locator string into PW keyword args.
     * e.g. `getByRole('tab', { name: 'npm', exact: true }).nth(1)` → `tab "npm" --nth 1`
     */
    function locatorToPwArgs(locator: string): string {
        // Extract nth modifier
        let nth = '';
        if (/\.first\(\)/.test(locator)) nth = ' --nth 0';
        else if (/\.last\(\)/.test(locator)) nth = ' --nth -1';
        else {
            const nthMatch = locator.match(/\.nth\((\d+)\)/);
            if (nthMatch) nth = ` --nth ${nthMatch[1]}`;
        }

        // getByRole with name
        const roleNameMatch = locator.match(/getByRole\(['"](.+?)['"],\s*\{[^}]*name:\s*['"](.+?)['"]/);
        if (roleNameMatch) return `${roleNameMatch[1]} ${q(roleNameMatch[2])}${nth}`;

        // getByRole without name
        const roleMatch = locator.match(/getByRole\(['"](.+?)['"]\)/);
        if (roleMatch) return `${roleMatch[1]}${nth}`;

        // getByTestId / getByLabel / getByText / getByPlaceholder / getByTitle / getByAltText
        const getByMatch = locator.match(/getBy\w+\(['"](.+?)['"]\)/);
        if (getByMatch) return `${q(getByMatch[1])}${nth}`;

        // locator('css') fallback
        const locatorMatch = locator.match(/locator\(['"](.+?)['"]\)/);
        if (locatorMatch) return `${q(locatorMatch[1])}${nth}`;

        return q(locator);
    }

    /** Check if element is a text-entry field */
    function isTextField(el: Element): boolean {
        if (el instanceof HTMLTextAreaElement) return true;
        if (el instanceof HTMLInputElement) {
            const type = el.type.toLowerCase();
            return !['checkbox', 'radio', 'submit', 'reset', 'button', 'hidden', 'file', 'image', 'range', 'color'].includes(type);
        }
        // contenteditable
        if (el.getAttribute('contenteditable') === 'true') return true;
        return false;
    }

    /** Check if element is a checkbox or radio */
    function isCheckable(el: Element): boolean {
        return el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
    }

    /** Build both PW and JS command strings */
    function buildCommands(action: string, el: Element, opts?: {
        value?: string;
        key?: string;
        checked?: boolean;
        option?: string;
        submit?: boolean;
    }): { pw: string; js: string } | null {
        const locator = generateLocator(el);
        const jsLoc = `page.${locator}`;
        const pwArgs = locatorToPwArgs(locator);

        switch (action) {
            case 'click':
                return {
                    pw: `click ${pwArgs}`,
                    js: `await ${jsLoc}.click();`,
                };

            case 'fill': {
                const val = opts?.value ?? '';
                const submitFlag = opts?.submit ? ' --submit' : '';
                return {
                    pw: `fill ${pwArgs} ${q(val)}${submitFlag}`,
                    js: `await ${jsLoc}.fill(${escapeString(val)});`,
                };
            }

            case 'check':
                return {
                    pw: `check ${pwArgs}`,
                    js: `await ${jsLoc}.check();`,
                };

            case 'uncheck':
                return {
                    pw: `uncheck ${pwArgs}`,
                    js: `await ${jsLoc}.uncheck();`,
                };

            case 'select': {
                const optVal = opts?.option ?? '';
                return {
                    pw: `select ${pwArgs} ${q(optVal)}`,
                    js: `await ${jsLoc}.selectOption(${escapeString(optVal)});`,
                };
            }

            case 'press': {
                const key = opts?.key ?? '';
                if (pwArgs) {
                    return {
                        pw: `press ${pwArgs} ${key}`,
                        js: `await ${jsLoc}.press(${escapeString(key)});`,
                    };
                }
                // Global key press (no locator context)
                return {
                    pw: `press ${key}`,
                    js: `await page.keyboard.press(${escapeString(key)});`,
                };
            }

            default:
                return null;
        }
    }

    // ─── Fill buffering state machine ─────────────────────────────────────────

    let pendingFill: { el: Element; value: string } | null = null;

    function flushPendingFill() {
        pendingFill = null;
    }

    // ─── Special key detection ────────────────────────────────────────────────

    const SPECIAL_KEYS = new Set([
        'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Home', 'End', 'PageUp', 'PageDown',
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    ]);

    // ─── Event handlers (capture phase, transparent) ──────────────────────────

    function onClickCapture(e: MouseEvent) {
        const target = e.target as Element;
        if (!target) return;

        // Skip clicks on text fields (focus-click noise before fill)
        if (isTextField(target)) return;

        // Skip clicks on checkable elements (handled by change event)
        if (isCheckable(target)) return;

        // Flush any pending fill
        flushPendingFill();

        const cmds = buildCommands('click', target);
        if (cmds) {
            chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
        }
    }

    function onInputCapture(e: Event) {
        const target = e.target as Element;
        if (!target || !isTextField(target)) return;

        const value = (target as HTMLInputElement | HTMLTextAreaElement).value ?? '';

        if (pendingFill && pendingFill.el === target) {
            // Same element — update
            pendingFill.value = value;
            const cmds = buildCommands('fill', target, { value });
            if (cmds) {
                chrome.runtime.sendMessage({ type: 'recorded-fill-update', action: cmds });
            }
        } else {
            // Different element or first input — flush old, start new
            flushPendingFill();
            pendingFill = { el: target, value };
            const cmds = buildCommands('fill', target, { value });
            if (cmds) {
                chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
            }
        }
    }

    function onChangeCapture(e: Event) {
        const target = e.target as Element;
        if (!target) return;

        // Checkbox / radio
        if (isCheckable(target)) {
            flushPendingFill();
            const checked = (target as HTMLInputElement).checked;
            const cmds = buildCommands(checked ? 'check' : 'uncheck', target);
            if (cmds) {
                chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
            }
            return;
        }

        // Select
        if (target instanceof HTMLSelectElement) {
            flushPendingFill();
            const option = target.value;
            const cmds = buildCommands('select', target, { option });
            if (cmds) {
                chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
            }
            return;
        }
    }

    function onKeyDownCapture(e: KeyboardEvent) {
        if (!SPECIAL_KEYS.has(e.key)) return;

        const target = e.target as Element;

        // Enter during fill → submit variant
        if (e.key === 'Enter' && pendingFill) {
            const cmds = buildCommands('fill', pendingFill.el, { value: pendingFill.value, submit: true });
            if (cmds) {
                chrome.runtime.sendMessage({ type: 'recorded-fill-submit', action: cmds });
            }
            flushPendingFill();
            return;
        }

        // Other special key → flush fill, emit press
        flushPendingFill();

        const cmds = target && target !== document.body && target !== document.documentElement
            ? buildCommands('press', target, { key: e.key })
            : { pw: `press ${e.key}`, js: `await page.keyboard.press(${escapeString(e.key)});` };
        if (cmds) {
            chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
        }
    }

    function onFocusOutCapture(e: FocusEvent) {
        if (pendingFill && e.target === pendingFill.el) {
            flushPendingFill();
        }
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    function cleanup() {
        flushPendingFill();
        (window as any).__pw_recorder_active = false;
        document.removeEventListener('click', onClickCapture, true);
        document.removeEventListener('input', onInputCapture, true);
        document.removeEventListener('change', onChangeCapture, true);
        document.removeEventListener('keydown', onKeyDownCapture, true);
        document.removeEventListener('focusout', onFocusOutCapture, true);
        chrome.runtime.onMessage.removeListener(onMessage);
    }

    function onMessage(msg: any) {
        if (msg.type === 'record-stop') cleanup();
    }

    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('input', onInputCapture, true);
    document.addEventListener('change', onChangeCapture, true);
    document.addEventListener('keydown', onKeyDownCapture, true);
    document.addEventListener('focusout', onFocusOutCapture, true);
})();
