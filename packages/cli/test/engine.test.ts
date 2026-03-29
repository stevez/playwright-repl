// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Engine } from '../src/engine.js';

// ─── Mock Playwright dependencies (injected via Engine constructor) ──────────

function createMockDeps() {
  const mockCallTool = vi.fn();
  const mockInitialize = vi.fn();
  const mockServerClosed = vi.fn();

  const mockBrowserContext = { on: vi.fn() };
  const mockCloseContext = vi.fn();
  const mockCreateContext = vi.fn().mockResolvedValue({
    browserContext: mockBrowserContext,
    close: mockCloseContext,
  });

  const mockContextFactory = vi.fn(() => ({ createContext: mockCreateContext }));
  const mockResolveConfig = vi.fn((config) => config);

  const mockParseCommand = vi.fn((command, args) => {
    const argv = args._.slice(1);
    const argNames = command.args ? Object.keys(command.args.shape) : [];
    const argsObj = {};
    argNames.forEach((name, i) => { argsObj[name] = argv[i]; });
    const toolName = typeof command.toolName === 'function'
      ? command.toolName(argsObj)
      : command.toolName;
    const toolParams = command.toolParams(argsObj);
    return { toolName, toolParams };
  });

  const mockCommands = {
    snapshot: { name: 'snapshot', toolName: 'browser_snapshot', toolParams: () => ({}) },
    click: {
      name: 'click',
      toolName: 'browser_click',
      toolParams: ({ ref }) => ({ ref }),
      args: { shape: { ref: true } },
    },
    close: { name: 'close', toolName: '', toolParams: () => ({}) },
    'run-code': {
      name: 'run-code',
      toolName: 'browser_run_code',
      toolParams: ({ code }) => ({ code }),
      args: { shape: { code: true } },
    },
  };

  return {
    deps: {
      BrowserServerBackend: vi.fn(function () {
        this.callTool = mockCallTool;
        this.initialize = mockInitialize;
        this.serverClosed = mockServerClosed;
      }),
      contextFactory: mockContextFactory,
      resolveConfig: mockResolveConfig,
      commands: mockCommands,
      parseCommand: mockParseCommand,
    },
    mocks: {
      callTool: mockCallTool,
      initialize: mockInitialize,
      serverClosed: mockServerClosed,
      browserContext: mockBrowserContext,
      closeContext: mockCloseContext,
      createContext: mockCreateContext,
      contextFactory: mockContextFactory,
      resolveConfig: mockResolveConfig,
      parseCommand: mockParseCommand,
      commands: mockCommands,
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine', () => {
  let engine;
  let mocks;

  beforeEach(() => {
    const { deps, mocks: m } = createMockDeps();
    mocks = m;
    engine = new Engine(deps);
  });

  afterEach(async () => {
    if (engine.connected)
      await engine.close();
  });

  // ─── start ──────────────────────────────────────────────────────────────

  describe('start', () => {
    it('initializes backend and sets connected', async () => {
      await engine.start({ headed: true });
      expect(engine.connected).toBe(true);
      expect(mocks.initialize).toHaveBeenCalled();
      expect(mocks.createContext).toHaveBeenCalled();
    });

    it('defaults to headless mode', async () => {
      await engine.start({});
      const config = mocks.contextFactory.mock.calls[0][0];
      expect(config.browser.launchOptions.headless).toBe(true);
    });

    it('configures headed mode', async () => {
      await engine.start({ headed: true });
      const config = mocks.contextFactory.mock.calls[0][0];
      expect(config.browser.launchOptions.headless).toBe(false);
    });

    it('configures CDP connect mode', async () => {
      await engine.start({ connect: 9222 });
      const config = mocks.contextFactory.mock.calls[0][0];
      expect(config.browser.cdpEndpoint).toBe('http://localhost:9222');
    });

    it('configures browser selection — firefox', async () => {
      await engine.start({ browser: 'firefox' });
      const config = mocks.contextFactory.mock.calls[0][0];
      expect(config.browser.browserName).toBe('firefox');
      expect(config.browser.launchOptions.channel).toBeUndefined();
    });

    it('configures browser selection — webkit', async () => {
      await engine.start({ browser: 'webkit' });
      const config = mocks.contextFactory.mock.calls[0][0];
      expect(config.browser.browserName).toBe('webkit');
    });

    it('configures browser selection — msedge', async () => {
      await engine.start({ browser: 'msedge' });
      const config = mocks.contextFactory.mock.calls[0][0];
      expect(config.browser.browserName).toBe('chromium');
      expect(config.browser.launchOptions.channel).toBe('msedge');
    });

    it('configures persistent profile', async () => {
      await engine.start({ persistent: true });
      const config = mocks.contextFactory.mock.calls[0][0];
      expect(config.browser.isolated).toBe(false);
    });

    it('configures isolated mode by default', async () => {
      await engine.start({});
      const config = mocks.contextFactory.mock.calls[0][0];
      expect(config.browser.isolated).toBe(true);
    });

    it('configures custom profile directory', async () => {
      await engine.start({ profile: '/tmp/my-profile' });
      const config = mocks.contextFactory.mock.calls[0][0];
      expect(config.browser.userDataDir).toBe('/tmp/my-profile');
      expect(config.browser.isolated).toBe(false);
    });

    it('listens for browser close event', async () => {
      await engine.start({});
      expect(mocks.browserContext.on).toHaveBeenCalledWith('close', expect.any(Function));

      // Simulate browser closing externally
      const closeHandler = mocks.browserContext.on.mock.calls.find(c => c[0] === 'close')[1];
      closeHandler();
      expect(engine.connected).toBe(false);
    });
  });

  // ─── run ────────────────────────────────────────────────────────────────

  describe('run', () => {
    beforeEach(async () => {
      await engine.start({});
    });

    it('dispatches command to backend.callTool', async () => {
      mocks.callTool.mockResolvedValue({
        content: [{ type: 'text', text: '### Snapshot\n...' }],
        isError: false,
      });

      const result = await engine.run({ _: ['snapshot'] });
      expect(mocks.callTool).toHaveBeenCalledWith('browser_snapshot', expect.objectContaining({ _meta: expect.any(Object) }));
      expect(result.text).toBe('### Snapshot\n...');
      expect(result.isError).toBe(false);
    });

    it('passes args to tool params', async () => {
      mocks.callTool.mockResolvedValue({
        content: [{ type: 'text', text: '### Result\nClicked' }],
        isError: false,
      });

      await engine.run({ _: ['click', 'e5'] });
      expect(mocks.callTool).toHaveBeenCalledWith('browser_click', expect.objectContaining({ ref: 'e5' }));
    });

    it('returns error for unknown command', async () => {
      await expect(engine.run({ _: ['nonexistent'] })).rejects.toThrow('Unknown command');
    });

    it('throws when engine not started', async () => {
      const { deps } = createMockDeps();
      const fresh = new Engine(deps);
      await expect(fresh.run({ _: ['snapshot'] })).rejects.toThrow('Engine not started');
    });

    it('handles commands with empty toolName', async () => {
      const result = await engine.run({ _: ['close'] });
      expect(result.text).toContain('not supported in engine mode');
      expect(mocks.callTool).not.toHaveBeenCalled();
    });

    it('returns isError from backend', async () => {
      mocks.callTool.mockResolvedValue({
        content: [{ type: 'text', text: '### Error\nSomething went wrong' }],
        isError: true,
      });

      const result = await engine.run({ _: ['snapshot'] });
      expect(result.isError).toBe(true);
      expect(result.text).toContain('Error');
    });
  });

  // ─── highlight ────────────────────────────────────────────────────────

  describe('highlight', () => {
    beforeEach(async () => {
      await engine.start({});
      mocks.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Highlighted' }],
        isError: false,
      });
    });

    it('uses page.locator() for CSS selectors', async () => {
      await engine.run({ _: ['highlight', '.btn'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_run_code',
        expect.objectContaining({ code: expect.stringContaining('page.locator(".btn").highlight()') }),
      );
    });

    it('uses page.getByText() for plain text', async () => {
      await engine.run({ _: ['highlight', 'Submit'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_run_code',
        expect.objectContaining({ code: expect.stringContaining('page.getByText("Submit").highlight()') }),
      );
    });

    it('joins multi-word text args and uses getByText', async () => {
      await engine.run({ _: ['highlight', 'Submit', 'Button'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_run_code',
        expect.objectContaining({ code: expect.stringContaining('page.getByText("Submit Button").highlight()') }),
      );
    });

    it('returns error when no locator provided', async () => {
      const result = await engine.run({ _: ['highlight'] });
      expect(result.isError).toBe(true);
      expect(result.text).toContain('Usage');
    });
  });

  // ─── >> chaining ────────────────────────────────────────────────────────

  describe('>> chaining', () => {
    beforeEach(async () => {
      await engine.start({});
      mocks.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Done' }],
        isError: false,
      });
    });

    it('translates click with quoted >> selector', async () => {
      await engine.run({ _: ['click', '.nav >> button'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_run_code',
        expect.objectContaining({ code: expect.stringContaining('page.locator(".nav >> button").click()') }),
      );
    });

    it('translates click with unquoted >> selector', async () => {
      await engine.run({ _: ['click', '.nav', '>>', 'button'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_run_code',
        expect.objectContaining({ code: expect.stringContaining('page.locator(".nav >> button").click()') }),
      );
    });

    it('translates hover with >> selector', async () => {
      await engine.run({ _: ['hover', '.menu', '>>', '.item'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_run_code',
        expect.objectContaining({ code: expect.stringContaining('page.locator(".menu >> .item").hover()') }),
      );
    });

    it('translates fill with quoted >> selector and value', async () => {
      await engine.run({ _: ['fill', '.form >> input', 'hello'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_run_code',
        expect.objectContaining({ code: expect.stringContaining('page.locator(".form >> input").fill("hello")') }),
      );
    });

    it('translates fill with unquoted >> selector and value', async () => {
      await engine.run({ _: ['fill', '.form', '>>', 'input', 'hello'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_run_code',
        expect.objectContaining({ code: expect.stringContaining('page.locator(".form >> input").fill("hello")') }),
      );
    });

    it('translates select with >> selector and value', async () => {
      await engine.run({ _: ['select', '.form >> select', 'opt'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_run_code',
        expect.objectContaining({ code: expect.stringContaining('page.locator(".form >> select").selectOption("opt")') }),
      );
    });

    it('does not trigger for commands without >>', async () => {
      await engine.run({ _: ['click', 'e5'] });
      expect(mocks.callTool).toHaveBeenCalledWith(
        'browser_click',
        expect.objectContaining({ ref: 'e5' }),
      );
    });
  });

  // ─── selectPageByUrl ────────────────────────────────────────────────────

  describe('selectPageByUrl', () => {
    beforeEach(async () => {
      mocks.browserContext.pages = vi.fn().mockReturnValue([]);
      mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }], isError: false });
      await engine.start({});
    });

    it('selects page with exact URL match', async () => {
      mocks.browserContext.pages.mockReturnValue([
        { url: () => 'https://example.com' },
        { url: () => 'https://google.com' },
      ]);
      await engine.selectPageByUrl('https://example.com');
      expect(mocks.callTool).toHaveBeenCalledWith('browser_tabs', { action: 'select', index: 0 });
    });

    it('strips query params when matching', async () => {
      mocks.browserContext.pages.mockReturnValue([
        { url: () => 'https://www.google.com/' },
      ]);
      await engine.selectPageByUrl('https://www.google.com/?zx=123&no_sw_cr=1');
      expect(mocks.callTool).toHaveBeenCalledWith('browser_tabs', { action: 'select', index: 0 });
    });

    it('strips trailing slash when matching', async () => {
      mocks.browserContext.pages.mockReturnValue([
        { url: () => 'https://example.com/' },
      ]);
      await engine.selectPageByUrl('https://example.com');
      expect(mocks.callTool).toHaveBeenCalledWith('browser_tabs', { action: 'select', index: 0 });
    });

    it('strips hash fragment when matching', async () => {
      mocks.browserContext.pages.mockReturnValue([
        { url: () => 'https://example.com/page' },
      ]);
      await engine.selectPageByUrl('https://example.com/page#section');
      expect(mocks.callTool).toHaveBeenCalledWith('browser_tabs', { action: 'select', index: 0 });
    });

    it('selects the correct index when multiple pages', async () => {
      mocks.browserContext.pages.mockReturnValue([
        { url: () => 'https://example.com' },
        { url: () => 'https://google.com' },
        { url: () => 'https://github.com' },
      ]);
      await engine.selectPageByUrl('https://github.com');
      expect(mocks.callTool).toHaveBeenCalledWith('browser_tabs', { action: 'select', index: 2 });
    });

    it('does nothing when URL does not match any page', async () => {
      mocks.browserContext.pages.mockReturnValue([
        { url: () => 'https://example.com' },
      ]);
      await engine.selectPageByUrl('https://other.com');
      expect(mocks.callTool).not.toHaveBeenCalled();
    });

    it('is a no-op when engine not started', async () => {
      const { deps } = createMockDeps();
      const fresh = new Engine(deps);
      await fresh.selectPageByUrl('https://example.com'); // Should not throw
      expect(mocks.callTool).not.toHaveBeenCalled();
    });
  });

  // ─── close ──────────────────────────────────────────────────────────────

  describe('close', () => {
    it('calls serverClosed and close callback', async () => {
      await engine.start({});
      await engine.close();

      expect(mocks.serverClosed).toHaveBeenCalled();
      expect(mocks.closeContext).toHaveBeenCalled();
      expect(engine.connected).toBe(false);
    });

    it('is safe to call multiple times', async () => {
      await engine.start({});
      await engine.close();
      await engine.close(); // Should not throw
      expect(mocks.serverClosed).toHaveBeenCalledTimes(1);
    });

    it('is safe to call without start', async () => {
      await engine.close(); // Should not throw
      expect(engine.connected).toBe(false);
    });
  });
});
