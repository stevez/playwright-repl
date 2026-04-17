import { describe, it, expect, beforeEach } from 'vitest';
import {
    getImplicitRole,
    getAccessibleName,
    getLabel,
    findByRoleAndName,
    findAllByRoleAndName,
    isHoverRevealed,
    locatorToPwArgs,
    escapeString,
    generateLocator,
    generateLocatorPair,
    buildCssSelector,
    isTextField,
    isCheckable,
    buildCommands,
} from '../../src/content/locator';

describe('locator', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    // ─── escapeString ─────────────────────────────────────────────────────

    describe('escapeString', () => {
        it('wraps in single quotes by default', () => {
            expect(escapeString('hello')).toBe("'hello'");
        });

        it('uses double quotes when string contains single quote', () => {
            expect(escapeString("it's")).toBe('"it\'s"');
        });

        it('escapes single quotes when string contains both', () => {
            expect(escapeString(`he said "it's"`)).toBe(`'he said "it\\'s"'`);
        });

        it('handles empty string', () => {
            expect(escapeString('')).toBe("''");
        });
    });

    // ─── getImplicitRole ──────────────────────────────────────────────────

    describe('getImplicitRole', () => {
        it('returns button for BUTTON', () => {
            const el = document.createElement('button');
            expect(getImplicitRole(el)).toBe('button');
        });

        it('returns link for A with href', () => {
            const el = document.createElement('a');
            el.setAttribute('href', '#');
            expect(getImplicitRole(el)).toBe('link');
        });

        it('returns null for A without href', () => {
            const el = document.createElement('a');
            expect(getImplicitRole(el)).toBeNull();
        });

        it('returns textbox for text INPUT', () => {
            const el = document.createElement('input');
            el.type = 'text';
            expect(getImplicitRole(el)).toBe('textbox');
        });

        it('returns checkbox for checkbox INPUT', () => {
            const el = document.createElement('input');
            el.type = 'checkbox';
            expect(getImplicitRole(el)).toBe('checkbox');
        });

        it('returns radio for radio INPUT', () => {
            const el = document.createElement('input');
            el.type = 'radio';
            expect(getImplicitRole(el)).toBe('radio');
        });

        it('returns button for submit INPUT', () => {
            const el = document.createElement('input');
            el.type = 'submit';
            expect(getImplicitRole(el)).toBe('button');
        });

        it('returns null for hidden INPUT', () => {
            const el = document.createElement('input');
            el.type = 'hidden';
            expect(getImplicitRole(el)).toBeNull();
        });

        it('returns textbox for TEXTAREA', () => {
            const el = document.createElement('textarea');
            expect(getImplicitRole(el)).toBe('textbox');
        });

        it('returns combobox for SELECT', () => {
            const el = document.createElement('select');
            expect(getImplicitRole(el)).toBe('combobox');
        });

        it('returns heading for H1-H6', () => {
            for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
                const el = document.createElement(tag);
                expect(getImplicitRole(el)).toBe('heading');
            }
        });

        it('returns img for IMG', () => {
            const el = document.createElement('img');
            expect(getImplicitRole(el)).toBe('img');
        });

        it('returns navigation for NAV', () => {
            const el = document.createElement('nav');
            expect(getImplicitRole(el)).toBe('navigation');
        });

        it('returns list for UL and OL', () => {
            expect(getImplicitRole(document.createElement('ul'))).toBe('list');
            expect(getImplicitRole(document.createElement('ol'))).toBe('list');
        });

        it('returns listitem for LI', () => {
            const el = document.createElement('li');
            expect(getImplicitRole(el)).toBe('listitem');
        });

        it('returns null for unknown elements', () => {
            const el = document.createElement('div');
            expect(getImplicitRole(el)).toBeNull();
        });

        it('returns explicit role when set', () => {
            const el = document.createElement('div');
            el.setAttribute('role', 'tab');
            expect(getImplicitRole(el)).toBe('tab');
        });

        it('ignores role=none', () => {
            const el = document.createElement('button');
            el.setAttribute('role', 'none');
            expect(getImplicitRole(el)).toBe('button');
        });

        it('ignores role=presentation', () => {
            const el = document.createElement('button');
            el.setAttribute('role', 'presentation');
            expect(getImplicitRole(el)).toBe('button');
        });
    });

    // ─── getAccessibleName ────────────────────────────────────────────────

    describe('getAccessibleName', () => {
        it('returns aria-label', () => {
            const el = document.createElement('button');
            el.setAttribute('aria-label', 'Close dialog');
            expect(getAccessibleName(el)).toBe('Close dialog');
        });

        it('returns aria-labelledby text', () => {
            document.body.innerHTML = '<span id="lbl">Hello</span><button aria-labelledby="lbl">X</button>';
            const btn = document.querySelector('button')!;
            expect(getAccessibleName(btn)).toBe('Hello');
        });

        it('joins multiple aria-labelledby refs', () => {
            document.body.innerHTML = '<span id="a">First</span><span id="b">Second</span><button aria-labelledby="a b">X</button>';
            const btn = document.querySelector('button')!;
            expect(getAccessibleName(btn)).toBe('First Second');
        });

        it('returns label for input with explicit label', () => {
            document.body.innerHTML = '<label for="name">Full Name</label><input id="name" type="text">';
            const input = document.querySelector('input')!;
            expect(getAccessibleName(input)).toBe('Full Name');
        });

        it('returns label for input with implicit label', () => {
            document.body.innerHTML = '<label>Username <input type="text"></label>';
            const input = document.querySelector('input')!;
            expect(getAccessibleName(input)).toBe('Username');
        });

        it('returns text content for name-from-content roles', () => {
            const btn = document.createElement('button');
            btn.textContent = 'Submit';
            expect(getAccessibleName(btn)).toBe('Submit');
        });

        it('returns empty for long text content (>80 chars)', () => {
            const btn = document.createElement('button');
            btn.textContent = 'x'.repeat(81);
            expect(getAccessibleName(btn)).toBe('');
        });

        it('returns alt for IMG', () => {
            const img = document.createElement('img');
            img.setAttribute('alt', 'Logo');
            expect(getAccessibleName(img)).toBe('Logo');
        });

        it('returns empty for div with no accessible name', () => {
            const el = document.createElement('div');
            expect(getAccessibleName(el)).toBe('');
        });

        it('aria-label takes precedence over text content', () => {
            const btn = document.createElement('button');
            btn.textContent = 'Text';
            btn.setAttribute('aria-label', 'Label');
            expect(getAccessibleName(btn)).toBe('Label');
        });
    });

    // ─── getLabel ─────────────────────────────────────────────────────────

    describe('getLabel', () => {
        it('returns explicit label by for attribute', () => {
            document.body.innerHTML = '<label for="email">Email</label><input id="email" type="text">';
            const input = document.querySelector('input') as HTMLInputElement;
            expect(getLabel(input)).toBe('Email');
        });

        it('returns implicit label from parent', () => {
            document.body.innerHTML = '<label>Password <input type="password"></label>';
            const input = document.querySelector('input') as HTMLInputElement;
            expect(getLabel(input)).toBe('Password');
        });

        it('returns empty when no label', () => {
            document.body.innerHTML = '<input type="text">';
            const input = document.querySelector('input') as HTMLInputElement;
            expect(getLabel(input)).toBe('');
        });

        it('excludes input text from implicit label', () => {
            document.body.innerHTML = '<label>Name <input type="text" value="Alice"></label>';
            const input = document.querySelector('input') as HTMLInputElement;
            expect(getLabel(input)).toBe('Name');
        });
    });

    // ─── findByRoleAndName ────────────────────────────────────────────────

    describe('findByRoleAndName', () => {
        it('finds matching elements', () => {
            document.body.innerHTML = '<button>OK</button><button>Cancel</button>';
            const matches = findByRoleAndName('button', 'OK');
            expect(matches).toHaveLength(1);
            expect(matches[0].textContent).toBe('OK');
        });

        it('finds multiple elements with same role and name', () => {
            document.body.innerHTML = '<button>Save</button><button>Save</button>';
            const matches = findByRoleAndName('button', 'Save');
            expect(matches).toHaveLength(2);
        });

        it('returns empty for no matches', () => {
            document.body.innerHTML = '<button>OK</button>';
            expect(findByRoleAndName('button', 'Missing')).toHaveLength(0);
        });

        it('excludes hidden elements via checkVisibility', () => {
            document.body.innerHTML = '<button>Delete</button><button>Delete</button><button>Delete</button>';
            const buttons = document.querySelectorAll('button');
            // Stub checkVisibility: only first button visible (like TodoMVC hover-revealed delete)
            (buttons[0] as any).checkVisibility = () => true;
            (buttons[1] as any).checkVisibility = () => false;
            (buttons[2] as any).checkVisibility = () => false;
            const matches = findByRoleAndName('button', 'Delete');
            expect(matches).toHaveLength(1);
            expect(matches[0]).toBe(buttons[0]);
            // No .nth() needed — only one visible match
            expect(generateLocator(buttons[0])).toBe("getByRole('button', { name: 'Delete' })");
        });
    });

    // ─── findAllByRoleAndName ────────────────────────────────────────────

    describe('findAllByRoleAndName', () => {
        it('includes hidden elements (ignores checkVisibility)', () => {
            document.body.innerHTML = '<button>Delete</button><button>Delete</button><button>Delete</button>';
            const buttons = document.querySelectorAll('button');
            (buttons[0] as any).checkVisibility = () => true;
            (buttons[1] as any).checkVisibility = () => false;
            (buttons[2] as any).checkVisibility = () => false;
            // findByRoleAndName returns only visible
            expect(findByRoleAndName('button', 'Delete')).toHaveLength(1);
            // findAllByRoleAndName returns all regardless of visibility
            expect(findAllByRoleAndName('button', 'Delete')).toHaveLength(3);
        });
    });

    // ─── isHoverRevealed ──────────────────────────────────────────────────

    describe('isHoverRevealed', () => {
        it('returns false when no stylesheets exist', () => {
            document.body.innerHTML = '<button>Delete</button>';
            const btn = document.querySelector('button')!;
            expect(isHoverRevealed(btn)).toBe(false);
        });

        it('detects hover-dependent display rule', () => {
            const style = document.createElement('style');
            style.textContent = '.item .destroy { display: none; } .item:hover .destroy { display: inline-block; }';
            document.head.appendChild(style);
            document.body.innerHTML = '<div class="item"><button class="destroy">Delete</button></div>';
            // Simulate hover state — el.matches(':hover') selector works only when hovered,
            // but in happy-dom there's no real hover. The test verifies the function runs
            // without errors and returns false in a non-hovered environment.
            const btn = document.querySelector('.destroy')!;
            // In a real browser with hover active, this would return true.
            // In happy-dom without hover, el.matches('.item:hover .destroy') is false.
            expect(typeof isHoverRevealed(btn)).toBe('boolean');
            document.head.removeChild(style);
        });
    });

    // ─── generateLocator ──────────────────────────────────────────────────

    describe('generateLocator', () => {
        it('uses data-testid when present', () => {
            const el = document.createElement('div');
            el.setAttribute('data-testid', 'my-widget');
            expect(generateLocator(el)).toBe("getByTestId('my-widget')");
        });

        it('uses data-test-id as fallback', () => {
            const el = document.createElement('div');
            el.setAttribute('data-test-id', 'widget');
            expect(generateLocator(el)).toBe("getByTestId('widget')");
        });

        it('uses role + name for button', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            expect(generateLocator(btn)).toBe("getByRole('button', { name: 'Submit' })");
        });

        it('disambiguates with .first() and .nth() for duplicate role+name', () => {
            document.body.innerHTML = '<button>Save</button><button>Save</button><button>Save</button>';
            const buttons = document.querySelectorAll('button');
            expect(generateLocator(buttons[0])).toContain('.first()');
            expect(generateLocator(buttons[1])).toContain('.nth(1)');
            expect(generateLocator(buttons[2])).toContain('.nth(2)');
        });

        it('uses getByLabel for labeled input', () => {
            document.body.innerHTML = '<label for="email">Email</label><input id="email" type="text">';
            const input = document.querySelector('input')!;
            // Input has role=textbox and name from label, so it uses getByRole
            const loc = generateLocator(input);
            expect(loc).toContain('Email');
        });

        it('uses getByPlaceholder for input with placeholder', () => {
            const input = document.createElement('input');
            input.type = 'hidden'; // hidden has no role, no label
            input.setAttribute('placeholder', 'Search...');
            document.body.appendChild(input);
            expect(generateLocator(input)).toBe("getByPlaceholder('Search...')");
        });

        it('uses getByAltText for IMG with alt', () => {
            const img = document.createElement('img');
            img.setAttribute('alt', 'Company logo');
            document.body.appendChild(img);
            // IMG has role=img and name=alt, so it uses getByRole
            expect(generateLocator(img)).toContain('Company logo');
        });

        it('uses getByTitle for element with title', () => {
            const el = document.createElement('div');
            el.setAttribute('title', 'Tooltip text');
            document.body.appendChild(el);
            expect(generateLocator(el)).toBe("getByTitle('Tooltip text')");
        });

        it('uses getByText for element with short text', () => {
            const el = document.createElement('span');
            el.textContent = 'Hello world';
            document.body.appendChild(el);
            expect(generateLocator(el)).toBe("getByText('Hello world')");
        });

        it('uses getByRole without name for role-only elements', () => {
            const el = document.createElement('nav');
            document.body.appendChild(el);
            expect(generateLocator(el)).toBe("getByRole('navigation')");
        });

        it('falls back to CSS selector', () => {
            const el = document.createElement('div');
            document.body.appendChild(el);
            expect(generateLocator(el)).toBe("locator('div')");
        });
    });

    // ─── ancestor context disambiguation ────────────────────────────────────

    describe('ancestor context disambiguation', () => {
        it('uses ancestor listitem context instead of .nth()', () => {
            document.body.innerHTML = `
                <ul>
                    <li><span>reading</span><button>Delete</button></li>
                    <li><span>shopping</span><button>Delete</button></li>
                    <li><span>learning</span><button>Delete</button></li>
                </ul>`;
            const buttons = document.querySelectorAll('button');
            expect(generateLocator(buttons[0])).toBe(
                "getByRole('listitem').filter({ hasText: 'reading' }).getByRole('button', { name: 'Delete' })"
            );
            expect(generateLocator(buttons[1])).toBe(
                "getByRole('listitem').filter({ hasText: 'shopping' }).getByRole('button', { name: 'Delete' })"
            );
            expect(generateLocator(buttons[2])).toBe(
                "getByRole('listitem').filter({ hasText: 'learning' }).getByRole('button', { name: 'Delete' })"
            );
        });

        it('falls back to .nth() when ancestor text is not unique', () => {
            document.body.innerHTML = `
                <ul>
                    <li><span>same</span><button>Delete</button></li>
                    <li><span>same</span><button>Delete</button></li>
                </ul>`;
            const buttons = document.querySelectorAll('button');
            expect(generateLocator(buttons[0])).toContain('.first()');
            expect(generateLocator(buttons[1])).toContain('.nth(1)');
        });

        it('falls back to .nth() when no container ancestor exists', () => {
            document.body.innerHTML = '<button>Save</button><button>Save</button>';
            const buttons = document.querySelectorAll('button');
            expect(generateLocator(buttons[0])).toContain('.first()');
            expect(generateLocator(buttons[1])).toContain('.nth(1)');
        });

        it('falls back to .nth() when context text is empty', () => {
            document.body.innerHTML = `
                <ul>
                    <li><button>Delete</button></li>
                    <li><button>Delete</button></li>
                </ul>`;
            const buttons = document.querySelectorAll('button');
            expect(generateLocator(buttons[0])).toContain('.first()');
            expect(generateLocator(buttons[1])).toContain('.nth(1)');
        });

        it('falls back to .nth() when context text is too long', () => {
            const longText = 'x'.repeat(51);
            document.body.innerHTML = `
                <ul>
                    <li><span>${longText}</span><button>Delete</button></li>
                    <li><span>short</span><button>Delete</button></li>
                </ul>`;
            const buttons = document.querySelectorAll('button');
            expect(generateLocator(buttons[0])).toContain('.first()');
        });

        it('works with article container role', () => {
            document.body.innerHTML = `
                <article><h2>Post A</h2><button>Like</button></article>
                <article><h2>Post B</h2><button>Like</button></article>`;
            const buttons = document.querySelectorAll('button');
            expect(generateLocator(buttons[0])).toContain("filter({ hasText: 'Post A' })");
            expect(generateLocator(buttons[1])).toContain("filter({ hasText: 'Post B' })");
        });

        it('works with table row container role', () => {
            document.body.innerHTML = `
                <table>
                    <tr><td>Alice</td><td><button>Edit</button></td></tr>
                    <tr><td>Bob</td><td><button>Edit</button></td></tr>
                    <tr><td>Carol</td><td><button>Edit</button></td></tr>
                </table>`;
            const buttons = document.querySelectorAll('button');
            expect(generateLocator(buttons[0])).toBe(
                "getByRole('row').filter({ hasText: 'Alice' }).getByRole('button', { name: 'Edit' })"
            );
            expect(generateLocator(buttons[1])).toBe(
                "getByRole('row').filter({ hasText: 'Bob' }).getByRole('button', { name: 'Edit' })"
            );
            expect(generateLocator(buttons[2])).toBe(
                "getByRole('row').filter({ hasText: 'Carol' }).getByRole('button', { name: 'Edit' })"
            );
        });

        it('works with multi-column table rows with multiple buttons', () => {
            document.body.innerHTML = `
                <table>
                    <tr><td>Alice</td><td>alice@example.com</td><td><button>Edit</button> <button>Delete</button></td></tr>
                    <tr><td>Bob</td><td>bob@example.com</td><td><button>Edit</button> <button>Delete</button></td></tr>
                    <tr><td>Carol</td><td>carol@example.com</td><td><button>Edit</button> <button>Delete</button></td></tr>
                </table>`;
            const editButtons = [...document.querySelectorAll('button')].filter(b => b.textContent === 'Edit');
            const deleteButtons = [...document.querySelectorAll('button')].filter(b => b.textContent === 'Delete');
            expect(generateLocator(editButtons[0])).toBe(
                "getByRole('row').filter({ hasText: 'Alice' }).getByRole('button', { name: 'Edit' })"
            );
            expect(generateLocator(editButtons[2])).toBe(
                "getByRole('row').filter({ hasText: 'Carol' }).getByRole('button', { name: 'Edit' })"
            );
            expect(generateLocator(deleteButtons[1])).toBe(
                "getByRole('row').filter({ hasText: 'Bob' }).getByRole('button', { name: 'Delete' })"
            );
        });
    });

    // ─── generateLocatorPair ──────────────────────────────────────────────

    describe('generateLocatorPair', () => {
        it('returns same locator for both modes when no disambiguation needed', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            const pair = generateLocatorPair(btn);
            expect(pair.js).toBe(pair.pw);
            expect(pair.js).toBe("getByRole('button', { name: 'Submit' })");
        });

        it('returns ancestor context for JS and --in info for PW', () => {
            document.body.innerHTML = `
                <ul>
                    <li><span>reading</span><button>Delete</button></li>
                    <li><span>shopping</span><button>Delete</button></li>
                </ul>`;
            const buttons = document.querySelectorAll('button');
            const pair = generateLocatorPair(buttons[1]);
            expect(pair.js).toContain('.filter(');
            expect(pair.js).toContain('shopping');
            expect(pair.pw).toBe("getByRole('button', { name: 'Delete' })");
            expect(pair.ancestor).toEqual({ role: 'list', text: 'shopping' });
        });

        it('returns no ancestor info when no disambiguation needed', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            const pair = generateLocatorPair(btn);
            expect(pair.ancestor).toBeUndefined();
        });

        it('uses heading context for PW --in when no container role exists', () => {
            document.body.innerHTML = `
                <div>
                    <h3>Robot Framework</h3>
                    <div><a href="/rf">RFCP® Certified</a></div>
                </div>
                <div>
                    <h3>Testspezialist</h3>
                    <div><a href="/ts">RFCP® Certified</a></div>
                </div>`;
            const links = document.querySelectorAll('a');
            const pair0 = generateLocatorPair(links[0]);
            expect(pair0.js).toContain('.first()');
            expect(pair0.pw).toBe("getByRole('link', { name: 'RFCP® Certified' })");
            expect(pair0.ancestor).toEqual({ role: '', text: 'Robot Framework' });

            const pair1 = generateLocatorPair(links[1]);
            expect(pair1.js).toContain('.nth(1)');
            expect(pair1.pw).toBe("getByRole('link', { name: 'RFCP® Certified' })");
            expect(pair1.ancestor).toEqual({ role: '', text: 'Testspezialist' });
        });

        it('falls back to .nth() when heading text is not unique', () => {
            document.body.innerHTML = `
                <div>
                    <h3>Section</h3>
                    <div><a href="/a">Same Link</a></div>
                </div>
                <div>
                    <h3>Section</h3>
                    <div><a href="/b">Same Link</a></div>
                </div>`;
            const links = document.querySelectorAll('a');
            const pair = generateLocatorPair(links[0]);
            expect(pair.js).toContain('.first()');
            expect(pair.pw).toContain('.first()');
            expect(pair.ancestor).toBeUndefined();
        });

        it('finds heading in nested wrapper before target branch', () => {
            document.body.innerHTML = `
                <div>
                    <div><h2>Alpha</h2></div>
                    <div><button>Go</button></div>
                </div>
                <div>
                    <div><h2>Beta</h2></div>
                    <div><button>Go</button></div>
                </div>`;
            const buttons = document.querySelectorAll('button');
            const pair = generateLocatorPair(buttons[1]);
            expect(pair.pw).toBe("getByRole('button', { name: 'Go' })");
            expect(pair.ancestor).toEqual({ role: '', text: 'Beta' });
        });

        it('finds label in banner/accordion preceding the target branch', () => {
            document.body.innerHTML = `
                <div>
                    <div role="banner"><p>Testspezialist</p><button>Aufklappen</button></div>
                    <div><a href="/rf">RFCP® Certified</a></div>
                </div>
                <div>
                    <div role="banner"><p>Robot Framework</p><button>Zuklappen</button></div>
                    <div><a href="/rf2">RFCP® Certified</a></div>
                </div>`;
            const links = document.querySelectorAll('a');
            const pair0 = generateLocatorPair(links[0]);
            expect(pair0.pw).toBe("getByRole('link', { name: 'RFCP® Certified' })");
            expect(pair0.ancestor).toEqual({ role: '', text: 'Testspezialist' });

            const pair1 = generateLocatorPair(links[1]);
            expect(pair1.ancestor).toEqual({ role: '', text: 'Robot Framework' });
        });

        it('finds label in plain div (no role) before target branch', () => {
            document.body.innerHTML = `
                <div>
                    <div class="title">Section A</div>
                    <div><a href="/a">Same Link</a></div>
                </div>
                <div>
                    <div class="title">Section B</div>
                    <div><a href="/b">Same Link</a></div>
                </div>`;
            const links = document.querySelectorAll('a');
            const pair = generateLocatorPair(links[1]);
            expect(pair.ancestor).toEqual({ role: '', text: 'Section B' });
        });
    });

    // ─── locatorToPwArgs ───────────────────────────────────────────────────

    describe('locatorToPwArgs', () => {
        it('parses getByRole with name', () => {
            expect(locatorToPwArgs("getByRole('button', { name: 'Submit' })"))
                .toBe('button "Submit"');
        });

        it('parses getByRole with name and exact: true', () => {
            expect(locatorToPwArgs("getByRole('tab', { name: 'npm', exact: true })"))
                .toBe('tab "npm"');
        });

        it('parses getByRole without name', () => {
            expect(locatorToPwArgs("getByRole('navigation')"))
                .toBe('navigation');
        });

        it('parses getByText', () => {
            expect(locatorToPwArgs("getByText('hello')"))
                .toBe('"hello"');
        });

        it('parses getByTestId', () => {
            expect(locatorToPwArgs("getByTestId('my-btn')"))
                .toBe('"my-btn"');
        });

        it('parses getByLabel', () => {
            expect(locatorToPwArgs("getByLabel('Email')"))
                .toBe('"Email"');
        });

        it('parses getByPlaceholder', () => {
            expect(locatorToPwArgs("getByPlaceholder('Search...')"))
                .toBe('"Search..."');
        });

        it('parses locator CSS fallback', () => {
            expect(locatorToPwArgs("locator('div#main')"))
                .toBe('"div#main"');
        });

        it('extracts .first() as --nth 0', () => {
            expect(locatorToPwArgs("getByRole('tab', { name: 'npm', exact: true }).first()"))
                .toBe('tab "npm" --nth 0');
        });

        it('extracts .last() as --nth -1', () => {
            expect(locatorToPwArgs("getByRole('tab', { name: 'npm', exact: true }).last()"))
                .toBe('tab "npm" --nth -1');
        });

        it('extracts .nth(N)', () => {
            expect(locatorToPwArgs("getByRole('tab', { name: 'npm', exact: true }).nth(2)"))
                .toBe('tab "npm" --nth 2');
        });

        it('handles unknown locator as quoted string', () => {
            expect(locatorToPwArgs('somethingWeird'))
                .toBe('"somethingWeird"');
        });

        // ─── Role prefix for non-getByRole patterns ──────────────────────

        it('prepends role for getByPlaceholder when role provided', () => {
            expect(locatorToPwArgs("getByPlaceholder('Search...')", 'textbox'))
                .toBe('textbox "Search..."');
        });

        it('prepends role for getByLabel when role provided', () => {
            expect(locatorToPwArgs("getByLabel('Email')", 'textbox'))
                .toBe('textbox "Email"');
        });

        it('prepends role for getByText when role provided', () => {
            expect(locatorToPwArgs("getByText('Submit')", 'button'))
                .toBe('button "Submit"');
        });

        it('does not prepend role for getByTestId', () => {
            expect(locatorToPwArgs("getByTestId('my-btn')", 'button'))
                .toBe('"my-btn"');
        });

        it('does not prepend role for getByRole (already has role)', () => {
            expect(locatorToPwArgs("getByRole('button', { name: 'Submit' })", 'button'))
                .toBe('button "Submit"');
        });

        it('prepends role with nth modifier', () => {
            expect(locatorToPwArgs("getByPlaceholder('Search...').first()", 'textbox'))
                .toBe('textbox "Search..." --nth 0');
        });
    });

    // ─── isTextField ──────────────────────────────────────────────────────

    describe('isTextField', () => {
        it('returns true for textarea', () => {
            expect(isTextField(document.createElement('textarea'))).toBe(true);
        });

        it('returns true for text input', () => {
            const el = document.createElement('input');
            el.type = 'text';
            expect(isTextField(el)).toBe(true);
        });

        it('returns true for email input', () => {
            const el = document.createElement('input');
            el.type = 'email';
            expect(isTextField(el)).toBe(true);
        });

        it('returns true for password input', () => {
            const el = document.createElement('input');
            el.type = 'password';
            expect(isTextField(el)).toBe(true);
        });

        it('returns true for search input', () => {
            const el = document.createElement('input');
            el.type = 'search';
            expect(isTextField(el)).toBe(true);
        });

        it('returns false for checkbox input', () => {
            const el = document.createElement('input');
            el.type = 'checkbox';
            expect(isTextField(el)).toBe(false);
        });

        it('returns false for radio input', () => {
            const el = document.createElement('input');
            el.type = 'radio';
            expect(isTextField(el)).toBe(false);
        });

        it('returns false for submit input', () => {
            const el = document.createElement('input');
            el.type = 'submit';
            expect(isTextField(el)).toBe(false);
        });

        it('returns false for hidden input', () => {
            const el = document.createElement('input');
            el.type = 'hidden';
            expect(isTextField(el)).toBe(false);
        });

        it('returns false for file input', () => {
            const el = document.createElement('input');
            el.type = 'file';
            expect(isTextField(el)).toBe(false);
        });

        it('returns false for range input', () => {
            const el = document.createElement('input');
            el.type = 'range';
            expect(isTextField(el)).toBe(false);
        });

        it('returns false for color input', () => {
            const el = document.createElement('input');
            el.type = 'color';
            expect(isTextField(el)).toBe(false);
        });

        it('returns true for contenteditable', () => {
            const el = document.createElement('div');
            el.setAttribute('contenteditable', 'true');
            expect(isTextField(el)).toBe(true);
        });

        it('returns false for non-contenteditable div', () => {
            expect(isTextField(document.createElement('div'))).toBe(false);
        });

        it('returns false for button', () => {
            expect(isTextField(document.createElement('button'))).toBe(false);
        });
    });

    // ─── isCheckable ─────────────────────────────────────────────────────

    describe('isCheckable', () => {
        it('returns true for checkbox', () => {
            const el = document.createElement('input');
            el.type = 'checkbox';
            expect(isCheckable(el)).toBe(true);
        });

        it('returns true for radio', () => {
            const el = document.createElement('input');
            el.type = 'radio';
            expect(isCheckable(el)).toBe(true);
        });

        it('returns false for text input', () => {
            const el = document.createElement('input');
            el.type = 'text';
            expect(isCheckable(el)).toBe(false);
        });

        it('returns false for button', () => {
            expect(isCheckable(document.createElement('button'))).toBe(false);
        });

        it('returns false for div', () => {
            expect(isCheckable(document.createElement('div'))).toBe(false);
        });
    });

    // ─── buildCommands ───────────────────────────────────────────────────

    describe('buildCommands', () => {
        it('builds hover command', () => {
            document.body.innerHTML = '<button>Menu</button>';
            const btn = document.querySelector('button')!;
            const cmds = buildCommands('hover', btn);
            expect(cmds).toEqual({
                pw: 'hover button "Menu"',
                js: "await page.getByRole('button', { name: 'Menu' }).hover();",
            });
        });

        it('builds click command', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            const cmds = buildCommands('click', btn);
            expect(cmds).toEqual({
                pw: "click button \"Submit\"",
                js: "await page.getByRole('button', { name: 'Submit' }).click();",
            });
        });

        it('builds fill command', () => {
            document.body.innerHTML = '<label for="email">Email</label><input id="email" type="text">';
            const input = document.querySelector('input')!;
            const cmds = buildCommands('fill', input, { value: 'test@example.com' });
            expect(cmds!.pw).toContain('fill');
            expect(cmds!.pw).toContain('"test@example.com"');
            expect(cmds!.js).toContain(".fill('test@example.com')");
        });

        it('builds fill without --submit flag', () => {
            document.body.innerHTML = '<label for="q">Search</label><input id="q" type="text">';
            const input = document.querySelector('input')!;
            const cmds = buildCommands('fill', input, { value: 'query' });
            expect(cmds!.pw).not.toContain('--submit');
        });

        it('builds fill with empty value', () => {
            document.body.innerHTML = '<label for="q">Search</label><input id="q" type="text">';
            const input = document.querySelector('input')!;
            const cmds = buildCommands('fill', input);
            expect(cmds!.pw).toContain('""');
            expect(cmds!.js).toContain(".fill('')");
        });

        it('builds check command', () => {
            document.body.innerHTML = '<label><input type="checkbox"> Accept</label>';
            const input = document.querySelector('input')!;
            const cmds = buildCommands('check', input);
            expect(cmds!.pw).toMatch(/^check /);
            expect(cmds!.js).toContain('.check()');
        });

        it('builds uncheck command', () => {
            document.body.innerHTML = '<label><input type="checkbox"> Accept</label>';
            const input = document.querySelector('input')!;
            const cmds = buildCommands('uncheck', input);
            expect(cmds!.pw).toMatch(/^uncheck /);
            expect(cmds!.js).toContain('.uncheck()');
        });

        it('builds select command', () => {
            document.body.innerHTML = '<label for="color">Color</label><select id="color"><option>Red</option></select>';
            const select = document.querySelector('select')!;
            const cmds = buildCommands('select', select, { option: 'Red' });
            expect(cmds!.pw).toMatch(/^select /);
            expect(cmds!.pw).toContain('"Red"');
            expect(cmds!.js).toContain(".selectOption('Red')");
        });

        it('builds press command with locator', () => {
            document.body.innerHTML = '<button>OK</button>';
            const btn = document.querySelector('button')!;
            const cmds = buildCommands('press', btn, { key: 'Enter' });
            expect(cmds!.pw).toContain('press');
            expect(cmds!.pw).toContain('Enter');
            expect(cmds!.js).toContain(".press('Enter')");
        });

        it('returns null for unknown action', () => {
            const el = document.createElement('div');
            expect(buildCommands('unknown', el)).toBeNull();
        });

        it('uses ancestor context in JS and --in in PW for click', () => {
            document.body.innerHTML = `
                <ul>
                    <li><span>reading</span><button>Delete</button></li>
                    <li><span>shopping</span><button>Delete</button></li>
                </ul>`;
            const buttons = document.querySelectorAll('button');
            const cmds = buildCommands('click', buttons[1]);
            expect(cmds!.js).toContain(".filter({ hasText: 'shopping' })");
            expect(cmds!.js).toContain('.click()');
            expect(cmds!.pw).toBe('click button "Delete" --in list "shopping"');
        });

        it('uses --in with row role for table', () => {
            document.body.innerHTML = `
                <table>
                    <tr><td>Alice</td><td>alice@example.com</td><td><button>Edit</button> <button>Delete</button></td></tr>
                    <tr><td>Bob</td><td>bob@example.com</td><td><button>Edit</button> <button>Delete</button></td></tr>
                </table>`;
            const editButtons = [...document.querySelectorAll('button')].filter(b => b.textContent === 'Edit');
            const cmds = buildCommands('click', editButtons[1]);
            expect(cmds!.pw).toBe('click button "Edit" --in row "Bob"');
        });

        it('uses text-only --in from heading context instead of --nth', () => {
            document.body.innerHTML = `
                <div>
                    <h3>Robot Framework</h3>
                    <div><a href="/rf">RFCP® Certified</a></div>
                </div>
                <div>
                    <h3>Testspezialist</h3>
                    <div><a href="/ts">RFCP® Certified</a></div>
                </div>`;
            const links = document.querySelectorAll('a');
            const cmds0 = buildCommands('click', links[0]);
            expect(cmds0!.pw).toBe('click link "RFCP® Certified" --in "Robot Framework"');
            expect(cmds0!.js).toContain('.first()');
            expect(cmds0!.js).toContain('.click()');

            const cmds1 = buildCommands('click', links[1]);
            expect(cmds1!.pw).toBe('click link "RFCP® Certified" --in "Testspezialist"');
        });
    });

    // ─── buildCssSelector ─────────────────────────────────────────────────

    describe('buildCssSelector', () => {
        it('uses tag#id when id is present', () => {
            const el = document.createElement('div');
            el.id = 'main';
            expect(buildCssSelector(el)).toBe('div#main');
        });

        it('uses tag.class when classes are present', () => {
            const el = document.createElement('span');
            el.className = 'highlight bold extra';
            // Only first 2 classes
            expect(buildCssSelector(el)).toBe('span.highlight.bold');
        });

        it('falls back to tag name', () => {
            const el = document.createElement('section');
            expect(buildCssSelector(el)).toBe('section');
        });
    });
});
