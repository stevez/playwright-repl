import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';

import Splitter from '@/components/Splitter';

describe("Splitter component tests", () => {
    it('should resize editor pane on drag', async () => {
        // Create a fake editor pane div with offsetHeight
        const editorDiv = document.createElement('div');
        Object.defineProperty(editorDiv, 'offsetHeight', { value: 300 });
        document.body.appendChild(editorDiv);
        const ref = { current: editorDiv };

        const screen = await render(<Splitter editorPaneRef={ref} />);
        const splitter = screen.container.querySelector('#splitter')!;

        // mousedown at y=300
        splitter.dispatchEvent(new MouseEvent('mousedown', { clientY: 300, bubbles: true }));

        // Wait for React state update (isDragging=true) to attach mousemove listener
        await new Promise(r => setTimeout(r, 0));

        // mousemove to y=400 (delta +100)
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }));
        expect(editorDiv.style.flex).toBe('0 0 400px'); // 300 + 100

        // mouseup resets cursor
        document.dispatchEvent(new MouseEvent('mouseup'));
        expect(document.body.style.cursor).toBe('');

        document.body.removeChild(editorDiv);
    });
})