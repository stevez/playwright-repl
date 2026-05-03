/**
 * Tests for BrowserController — browser lifecycle, recording, and picking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserController } from '../../src/browserController';

// ─── Simple mocks ─────────────────────────────────────────────────────────

function createMockVscode() {
  return {
    window: {
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    },
    commands: {
      executeCommand: vi.fn(),
    },
  } as any;
}

function createMockLogger() {
  return {
    appendLine: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  } as any;
}

function createMockViews() {
  return {
    replView: {
      setBrowserManager: vi.fn(),
      notifyBrowserConnected: vi.fn(),
      notifyBrowserDisconnected: vi.fn(),
    } as any,
    locatorsView: {
      setBrowserManager: vi.fn(),
    } as any,
    assertView: {
      setBrowserManager: vi.fn(),
      setPicker: vi.fn(),
    } as any,
    settingsView: {
      setRecording: vi.fn(),
    } as any,
  };
}

function createMockBrowserManager(overrides: Record<string, any> = {}) {
  return {
    isRunning: vi.fn(() => false),
    launch: vi.fn(),
    stop: vi.fn(),
    runCommand: vi.fn(() => ({ text: 'Done', isError: false })),
    runScript: vi.fn(() => ({ text: 'Done', isError: false })),
    onEvent: vi.fn(),
    onClose: vi.fn(),
    page: null,
    bridge: undefined,
    httpPort: null,
    cdpUrl: undefined,
    ...overrides,
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('BrowserController', () => {
  let vscode: ReturnType<typeof createMockVscode>;
  let logger: ReturnType<typeof createMockLogger>;
  let views: ReturnType<typeof createMockViews>;
  let mockBm: ReturnType<typeof createMockBrowserManager>;
  let controller: BrowserController;

  beforeEach(() => {
    vscode = createMockVscode();
    logger = createMockLogger();
    views = createMockViews();
    mockBm = createMockBrowserManager();
    controller = new BrowserController(vscode, logger, () => mockBm);
    controller.setViews(views.replView, views.locatorsView, views.assertView, views.settingsView);
  });

  it('should not be running initially', () => {
    expect(controller.isRunning()).toBe(false);
    expect(controller.browserManager).toBeUndefined();
  });

  it('ensureLaunched should create and launch BrowserManager', async () => {
    await controller.ensureLaunched('/workspace');
    expect(mockBm.launch).toHaveBeenCalledWith({
      browser: 'chromium',
      headless: false,
      workspaceFolder: '/workspace',
    });
  });

  it('ensureLaunched should notify views on connect', async () => {
    await controller.ensureLaunched();
    expect(views.replView.setBrowserManager).toHaveBeenCalledWith(mockBm);
    expect(views.replView.notifyBrowserConnected).toHaveBeenCalled();
    expect(views.locatorsView.setBrowserManager).toHaveBeenCalledWith(mockBm);
    expect(views.assertView.setBrowserManager).toHaveBeenCalledWith(mockBm);
  });

  it('ensureLaunched should not re-launch when already running', async () => {
    mockBm.isRunning.mockReturnValue(true);
    await controller.ensureLaunched();
    // launch() is only called by ensureLaunched when not running.
    // Since we start with isRunning=true before the first ensureLaunched,
    // the mock was never created yet. Let's call twice:
    mockBm.isRunning.mockReturnValue(false);
    await controller.ensureLaunched();
    expect(mockBm.launch).toHaveBeenCalledTimes(1);
    mockBm.isRunning.mockReturnValue(true);
    await controller.ensureLaunched();
    expect(mockBm.launch).toHaveBeenCalledTimes(1);
  });

  it('stop should call browserManager.stop and notify replView', async () => {
    await controller.ensureLaunched();
    await controller.stop();
    expect(mockBm.stop).toHaveBeenCalled();
    expect(views.replView.notifyBrowserDisconnected).toHaveBeenCalled();
  });

  it('startRecording should auto-launch and warn if launch fails', async () => {
    await controller.startRecording();
    expect(mockBm.launch).toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Could not launch browser.');
  });

  it('stopRecording should update settingsView', () => {
    controller.stopRecording();
    expect(views.settingsView.setRecording).toHaveBeenCalledWith(false);
  });

  it('pickLocator should auto-launch and warn if launch fails', async () => {
    await controller.pickLocator();
    expect(mockBm.launch).toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Could not launch browser.');
  });

  it('onWillRunTests should set PW_REUSE_CDP and return reusingBrowser', async () => {
    mockBm.cdpUrl = 'ws://127.0.0.1:9222/devtools/browser/abc';
    mockBm.isRunning.mockReturnValue(true);
    await controller.ensureLaunched();

    const result = await controller.onWillRunTests('/workspace');
    expect(result).toEqual({
      resetTestServer: true,
      reusingBrowser: true,
    });
    expect(process.env.PW_REUSE_CDP).toBe('ws://127.0.0.1:9222/devtools/browser/abc');
    delete process.env.PW_REUSE_CDP;
  });

  it('onWillRunTests should return undefined when no cdpUrl', async () => {
    mockBm.cdpUrl = undefined;
    mockBm.isRunning.mockReturnValue(true);
    await controller.ensureLaunched();

    const result = await controller.onWillRunTests('/workspace');
    expect(result).toBeUndefined();
  });
});
