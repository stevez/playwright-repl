import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { useReducer } from 'react';

import ConsolePane from '@/components/ConsolePane';
import type { OutputLine } from '@/types'
import { panelReducer, initialState, PanelState } from '@/reducer';

vi.mock('@/lib/server', () => ({
  executeCommand: vi.fn(),
}));

import { executeCommand } from '@/lib/server';

vi.mock('@/lib/file-utils', () => ({
  saveImageToFile: vi.fn(),
}));
import { saveImageToFile } from '@/lib/file-utils';

const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const code_block = `
import { test, expect } from '@playwright/test';

test('recorded session', async ({ page }) => {
  // command list
  await page.goto("https://example.com");
  await page.getByText("Learn more").click();
  await expect(page.getByText("As described in RFC 2606 and RFC 6761")).toBeVisible();
});`.trim();

describe("ConsolePane component tests", () => {

  function TestWrapper({ initState = initialState }: { initState?: PanelState } = {}) {
    const [state, dispatch] = useReducer(panelReducer, initState)
    return <ConsolePane outputLines={state.outputLines} dispatch={dispatch} passCount={state.passCount} failCount={state.failCount} />;
  }

  beforeEach(() => {
    vi.mocked(executeCommand).mockClear();
    Object.assign(window, {
      chrome: {
        tabs: {
          query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        },
        runtime: {
          onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });
  })

  it('should render console pane', async () => {
    const screen = await render(<ConsolePane outputLines={[]} dispatch={vi.fn()} passCount={0} failCount={0} />);
    await expect.element(screen.getByRole('textbox')).toBeInTheDocument();
    await expect.element(screen.getByText('Terminal')).toBeInTheDocument();
  });

  it('should render output lines', async () => {
    const lines: OutputLine[] = [
      { text: 'click e5', type: 'command' },
      { text: 'Clicked', type: 'success' },
      { text: 'Element not found', type: 'error' },
    ];
    const screen = await render(<ConsolePane outputLines={lines} dispatch={vi.fn()} passCount={0} failCount={0} />);

    await expect.element(screen.getByText('click e5')).toBeInTheDocument();
    await expect.element(screen.getByText('Clicked')).toBeInTheDocument();
    await expect.element(screen.getByText('Element not found')).toBeInTheDocument();
  })

  it('should render prompt input', async () => {
    const screen = await render(<ConsolePane outputLines={[]} dispatch={vi.fn()} passCount={0} failCount={0} />);
    await screen.getByRole('textbox').fill('click e5');
    await expect.element(screen.getByRole('textbox')).toHaveTextContent('click e5');
  })

  it('should render pass / fail count stats', async () => {
    const screen = await render(<ConsolePane outputLines={[]} dispatch={vi.fn()} passCount={2} failCount={0} />);
    await expect.element(screen.getByText('2 passed / 0 failed')).toBeInTheDocument();
  });

  it('should submit command on Enter', async () => {
    vi.mocked(executeCommand).mockResolvedValue({ text: '### Ran Playwright code\n### Result\nClicked\n', isError: false });
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('click e5');
    await userEvent.keyboard('{Enter}');

    await expect.element(screen.getByText('click e5')).toBeInTheDocument();
    await expect.element(screen.getByText('Clicked')).toBeInTheDocument();
  })

  it('should submit command on Enter and display error message', async () => {
    vi.mocked(executeCommand).mockResolvedValue({ text: '### Error\nelement e5 not found\n### Page\n', isError: true });
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('click e5');
    await userEvent.keyboard('{Enter}');

    await expect.element(screen.getByText('click e5')).toBeInTheDocument();
    await expect.element(screen.getByText('element e5 not found')).toBeInTheDocument();
  })

  it('should render error message when repl server failed to respond', async () => {
    vi.mocked(executeCommand).mockRejectedValue(new Error('Async error'));

    const screen = await render(<TestWrapper />);
    await screen.getByRole('textbox').fill('click e5');
    await userEvent.keyboard('{Enter}');

    await expect.element(screen.getByText('Not connected to server. Run: playwright-repl --extension')).toBeInTheDocument();
  })

  it('should not submit empty string on Enter', async () => {
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('   ');
    await userEvent.keyboard('{Enter}');

    expect(executeCommand).not.toHaveBeenCalled();
  })

  it('should not submit on a non-Enter key', async () => {
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('click e5');
    await userEvent.keyboard('{Space}');

    expect(executeCommand).not.toHaveBeenCalled();
  })

  it('should not submit for comment', async () => {
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('# this is a comment');
    await userEvent.keyboard('{Enter}');

    expect(executeCommand).not.toHaveBeenCalled();
    expect(document.querySelector('.cm-placeholder')).toBeTruthy();
    await expect.element(screen.getByText('# this is a comment')).toBeInTheDocument();
  });

  it('should not submit for clear command', async () => {
    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'Clicked', type: 'success' },
      ]
    };

    const screen = await render(<TestWrapper initState={preloadedState} />);

    await screen.getByRole('textbox').fill('clear');
    await userEvent.keyboard('{Enter}');

    expect(executeCommand).not.toHaveBeenCalled();
    expect(document.querySelector('.cm-placeholder')).toBeTruthy();
    await expect.element(screen.getByText('click e5')).not.toBeInTheDocument();
    await expect.element(screen.getByText('Clicked')).not.toBeInTheDocument();
  });

  it('should clear the console', async () => {
    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'Clicked', type: 'success' },
      ]
    };

    const screen = await render(<TestWrapper initState={preloadedState} />);

    await expect.element(screen.getByText('click e5')).toBeInTheDocument();
    await expect.element(screen.getByText('Clicked')).toBeInTheDocument();

    await screen.getByText('Clear').click();

    await expect.element(screen.getByText('click e5')).not.toBeInTheDocument();
    await expect.element(screen.getByText('Clicked')).not.toBeInTheDocument();
  });

  it('should render code-block', async () => {
    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'Clicked', type: 'success' },
        { text: code_block, type: 'code-block' }
      ]
    };

    const screen = await render(<TestWrapper initState={preloadedState} />);

    await expect.element(screen.getByText('@playwright/test')).toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('should copy code block in the clippboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'Clicked', type: 'success' },
        { text: code_block, type: 'code-block' }
      ]
    };

    const screen = await render(<TestWrapper initState={preloadedState} />);

    await screen.getByRole('button', { name: 'Copy' }).click();
    expect(writeText).toHaveBeenCalledWith(code_block);
  });

  it('should render the screenshot image', async () => {
    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'screenshot image', image: testImage, type: 'screenshot' }
      ]
    };

    const screen = await render(<TestWrapper initState={preloadedState} />);

    await expect.element(screen.getByRole('img')).toBeInTheDocument();
    await expect.element(screen.getByText('Click to enlarge')).toBeInTheDocument();
  })

  it('should show the lightbox when clicking the image', async () => {
    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'screenshot image', image: testImage, type: 'screenshot' }
      ]
    };

    const screen = await render(<TestWrapper initState={preloadedState} />);
    await screen.getByRole('img').click();

    await expect.element(screen.getByRole('button', { name: '×' })).toBeInTheDocument();
  })

  it('should close the lightbox when clicking the close sign', async () => {
    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'screenshot image', image: testImage, type: 'screenshot' }
      ]
    };

    const screen = await render(<TestWrapper initState={preloadedState} />);
    await screen.getByRole('img').click();

    await screen.getByRole('button', { name: '×' }).click();

    await expect.element(screen.getByText('Click to enlarge')).toBeInTheDocument();
  })

  it('should save the image when clicking save button in thumbnail', async () => {
    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'screenshot image', image: testImage, type: 'screenshot' }
      ]
    };

    const screen = await render(<TestWrapper initState={preloadedState} />);
    await screen.getByRole('button', {name: 'Save'}).click();

    expect(saveImageToFile).toBeCalledWith(testImage);
  })

  it('should save the image when clicking save button in lightbox', async () => {
    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'screenshot image', image: testImage, type: 'screenshot' }
      ]
    };

    const screen = await render(<TestWrapper initState={preloadedState} />);
    await screen.getByRole('img').click();

    await screen.getByRole('button', {name: 'Save'}).nth(1).click();

    expect(saveImageToFile).toBeCalledWith(testImage);
  })

  it('should submit command on Enter with image', async () => {
    vi.mocked(executeCommand).mockResolvedValue({ text: '### Result\nscreenshot\n', image: testImage, isError: false });
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('screenshot');
    await userEvent.keyboard('{Enter}');

    await expect.element(screen.getByText('screenshot')).toBeInTheDocument();
    await expect.element(screen.getByRole('img')).toBeInTheDocument();
  })

})