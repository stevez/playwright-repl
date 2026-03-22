import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { SnapshotTree } from '@/components/Console/SnapshotTree';
import type { SnapshotNode } from '@/lib/snapshot-parser';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTree(): SnapshotNode {
    return {
        text: 'document', ref: 'e1',
        children: [
            {
                text: 'heading', ref: 'e2',
                children: [
                    { text: 'Hello World', ref: undefined, children: [] },
                ],
            },
            { text: 'button "Submit"', ref: 'e5', children: [] },
        ],
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SnapshotTree', () => {
    it('renders root node text', async () => {
        const screen = await render(<SnapshotTree node={makeTree()} depth={0} />);
        await expect.element(screen.getByText('document')).toBeInTheDocument();
    });

    it('renders ref as part of node text', async () => {
        const node: SnapshotNode = { text: 'document [ref=e1]', ref: 'e1', children: [] };
        const screen = await render(<SnapshotTree node={node} depth={0} />);
        await expect.element(screen.getByText('document [ref=e1]')).toBeInTheDocument();
    });

    it('auto-expands at depth < 2', async () => {
        const screen = await render(<SnapshotTree node={makeTree()} depth={0} />);
        await expect.element(screen.getByText('heading')).toBeInTheDocument();
        await expect.element(screen.getByText('button "Submit"')).toBeInTheDocument();
        await expect.element(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('collapses at depth >= 2', async () => {
        const heading: SnapshotNode = {
            text: 'heading', ref: 'e2',
            children: [{ text: 'Hello World', ref: undefined, children: [] }],
        };
        const screen = await render(<SnapshotTree node={heading} depth={2} />);
        await expect.element(screen.getByText('heading')).toBeInTheDocument();
        expect(screen.getByText('Hello World').query()).toBeNull();
    });

    it('shows toggle triangle for nodes with children', async () => {
        const screen = await render(<SnapshotTree node={makeTree()} depth={0} />);
        await expect.element(screen.getByText('▼').first()).toBeInTheDocument();
    });

    it('does not show toggle for leaf nodes', async () => {
        const leaf: SnapshotNode = { text: 'leaf', ref: undefined, children: [] };
        const screen = await render(<SnapshotTree node={leaf} depth={0} />);
        await expect.element(screen.getByText('leaf')).toBeInTheDocument();
        expect(screen.getByText('▼').query()).toBeNull();
        expect(screen.getByText('▶').query()).toBeNull();
    });

    it('toggles children on click', async () => {
        const node: SnapshotNode = {
            text: 'parent', ref: 'e1',
            children: [{ text: 'child', ref: undefined, children: [] }],
        };
        const screen = await render(<SnapshotTree node={node} depth={0} />);

        // Initially expanded (depth 0 < 2)
        await expect.element(screen.getByText('child')).toBeInTheDocument();

        // Click to collapse
        await screen.getByText('▼').click();
        expect(screen.getByText('child').query()).toBeNull();
        await expect.element(screen.getByText('▶')).toBeInTheDocument();

        // Click to re-expand
        await screen.getByText('▶').click();
        await expect.element(screen.getByText('child')).toBeInTheDocument();
    });

    it('does not render ref badge when ref is undefined', async () => {
        const node: SnapshotNode = { text: 'text node', ref: undefined, children: [] };
        const screen = await render(<SnapshotTree node={node} depth={0} />);
        await expect.element(screen.getByText('text node')).toBeInTheDocument();
        expect(screen.getByText(/\[ref=/).query()).toBeNull();
    });
});
