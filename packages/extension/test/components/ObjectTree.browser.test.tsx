/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ObjectTree } from '@/components/Console/ObjectTree';
import type { SerializedValue } from '@/components/Console/types';

vi.mock('@/lib/bridge', () => ({
    cdpGetProperties: vi.fn().mockResolvedValue({ result: [] }),
}));

// ─── Primitives ─────────────────────────────────────────────────────────────

describe('ObjectTree primitives', () => {
    it('renders null', async () => {
        const screen = await render(<ObjectTree data={{ __type: 'null' }} />);
        await expect.element(screen.getByText('null')).toBeInTheDocument();
    });

    it('renders undefined', async () => {
        const screen = await render(<ObjectTree data={{ __type: 'undefined' }} />);
        await expect.element(screen.getByText('undefined')).toBeInTheDocument();
    });

    it('renders string with quotes', async () => {
        const screen = await render(<ObjectTree data={{ __type: 'string', v: 'hello' }} />);
        await expect.element(screen.getByText('"hello"')).toBeInTheDocument();
    });

    it('renders number', async () => {
        const screen = await render(<ObjectTree data={{ __type: 'number', v: 42 }} />);
        await expect.element(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders boolean', async () => {
        const screen = await render(<ObjectTree data={{ __type: 'boolean', v: true }} />);
        await expect.element(screen.getByText('true')).toBeInTheDocument();
    });

    it('renders function', async () => {
        const screen = await render(<ObjectTree data={{ __type: 'function', name: 'myFunc' }} />);
        await expect.element(screen.getByText(/ƒ myFunc\(\)/)).toBeInTheDocument();
    });

    it('renders circular', async () => {
        const screen = await render(<ObjectTree data={{ __type: 'circular' }} />);
        await expect.element(screen.getByText('[Circular]')).toBeInTheDocument();
    });

    it('renders error', async () => {
        const screen = await render(<ObjectTree data={{ __type: 'error' }} />);
        await expect.element(screen.getByText('[Error]')).toBeInTheDocument();
    });
});

// ─── Labels ─────────────────────────────────────────────────────────────────

describe('ObjectTree labels', () => {
    it('renders label prefix', async () => {
        const screen = await render(<ObjectTree data={{ __type: 'string', v: 'val' }} label="key" />);
        await expect.element(screen.getByText('key')).toBeInTheDocument();
        await expect.element(screen.getByText('"val"')).toBeInTheDocument();
    });
});

// ─── Objects ────────────────────────────────────────────────────────────────

describe('ObjectTree objects', () => {
    it('renders empty object', async () => {
        const data: SerializedValue = { __type: 'object', cls: 'Object', props: {} };
        const screen = await render(<ObjectTree data={data} />);
        await expect.element(screen.getByText('Object {}')).toBeInTheDocument();
    });

    it('renders object with toggle when collapsed', async () => {
        const data: SerializedValue = {
            __type: 'object', cls: 'Object',
            props: { a: { __type: 'number', v: 1 } },
        };
        const screen = await render(<ObjectTree data={data} depth={1} />);
        await expect.element(screen.getByText('▶')).toBeInTheDocument();
    });

    it('expands object on toggle click', async () => {
        const data: SerializedValue = {
            __type: 'object', cls: 'Object',
            props: { x: { __type: 'string', v: 'hello' } },
        };
        const screen = await render(<ObjectTree data={data} depth={1} />);
        await screen.getByText('▶').click();
        await expect.element(screen.getByText('x')).toBeInTheDocument();
        await expect.element(screen.getByText('"hello"')).toBeInTheDocument();
    });
});

// ─── Arrays ─────────────────────────────────────────────────────────────────

describe('ObjectTree arrays', () => {
    it('renders array header', async () => {
        const data: SerializedValue = {
            __type: 'array', cls: 'Array', len: 2,
            props: { '0': { __type: 'number', v: 1 }, '1': { __type: 'number', v: 2 } },
        };
        const screen = await render(<ObjectTree data={data} depth={1} />);
        await expect.element(screen.getByText(/Array\(2\)/)).toBeInTheDocument();
    });

    it('renders empty array', async () => {
        const data: SerializedValue = {
            __type: 'array', cls: 'Array', len: 0, props: {},
        };
        const screen = await render(<ObjectTree data={data} />);
        await expect.element(screen.getByText('[]')).toBeInTheDocument();
    });
});

// ─── Refs ───────────────────────────────────────────────────────────────────

describe('ObjectTree refs', () => {
    it('renders static ref without objectId', async () => {
        const data: SerializedValue = { __type: 'ref', cls: 'HTMLElement' };
        const screen = await render(<ObjectTree data={data} />);
        await expect.element(screen.getByText(/HTMLElement/)).toBeInTheDocument();
    });

    it('renders expandable ref with objectId and fetches properties', async () => {
        const mockGetProps = vi.fn().mockResolvedValue({
            result: [
                { name: 'id', value: { type: 'string', value: 'main' } },
            ],
        });
        const data: SerializedValue = { __type: 'ref', cls: 'HTMLDivElement', objectId: 'obj-1' };
        const screen = await render(<ObjectTree data={data} getProperties={mockGetProps} />);

        // depth=0 → auto-expanded, triggers fetch
        await vi.waitFor(() => {
            expect(mockGetProps).toHaveBeenCalledWith('obj-1');
        });
        await expect.element(screen.getByText('id')).toBeInTheDocument();
    });
});

// ─── Lazy loading ───────────────────────────────────────────────────────────

describe('ObjectTree lazy loading', () => {
    it('fetches properties via getProperties when expanded', async () => {
        const mockGetProps = vi.fn().mockResolvedValue({
            result: [
                { name: 'foo', value: { type: 'string', value: 'bar' } },
            ],
        });
        const data: SerializedValue = {
            __type: 'object', cls: 'Object',
            props: { foo: { __type: 'ref', cls: 'Object' } },
            objectId: 'obj-2',
        };
        await render(<ObjectTree data={data} getProperties={mockGetProps} />);

        // depth=0 → auto-expanded, triggers fetch
        await vi.waitFor(() => {
            expect(mockGetProps).toHaveBeenCalledWith('obj-2');
        });
    });
});
