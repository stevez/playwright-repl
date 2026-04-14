/**
 * BrowserController — manages BrowserManager lifecycle for headed mode.
 *
 * Extracted from Extension (Phase 3) to isolate browser launch/stop,
 * CDP URL tracking, and view notification logic.
 */

import { BrowserManager, type IBrowserManager } from './browser';
import { Recorder } from './recorder';
import { Picker, type ILocatorsView, type IAssertView as IPickerAssertView } from './picker';
import * as vscodeTypes from './vscodeTypes';

// ─── View interfaces (decoupled from concrete classes) ────────────────────

export interface IBrowserView {
  setBrowserManager(browserManager: IBrowserManager): void;
}

export interface IReplView extends IBrowserView {
  notifyBrowserConnected(): void;
  notifyBrowserDisconnected(): void;
}

export interface IAssertView extends IBrowserView, IPickerAssertView {
  setPicker(picker: Picker): void;
}

export interface ISettingsView {
  setRecording(recording: boolean): void;
}

export type BrowserManagerFactory = (logger: vscodeTypes.LogOutputChannel) => BrowserManager;

const defaultFactory: BrowserManagerFactory = (logger) => new BrowserManager(logger);

export class BrowserController {
  private _vscode: vscodeTypes.VSCode;
  private _logger: vscodeTypes.LogOutputChannel;
  private _browserManager?: BrowserManager;
  private _launchPromise?: Promise<void>;
  private _recorder?: Recorder;
  private _picker?: Picker;
  private _lastCdpUrl: string | undefined;
  private _createBrowserManager: BrowserManagerFactory;

  // UI views — set after construction
  private _replView?: IReplView;
  private _locatorsView?: IBrowserView & ILocatorsView;
  private _assertView?: IAssertView;
  private _settingsView?: ISettingsView;

  constructor(vscode: vscodeTypes.VSCode, logger: vscodeTypes.LogOutputChannel, createBrowserManager?: BrowserManagerFactory) {
    this._vscode = vscode;
    this._logger = logger;
    this._createBrowserManager = createBrowserManager ?? defaultFactory;
  }

  setViews(replView: IReplView, locatorsView: IBrowserView & ILocatorsView, assertView: IAssertView, settingsView: ISettingsView) {
    this._replView = replView;
    this._locatorsView = locatorsView;
    this._assertView = assertView;
    this._settingsView = settingsView;
  }

  get browserManager(): IBrowserManager | undefined { return this._browserManager; }
  get cdpUrl(): string | undefined { return this._browserManager?.cdpUrl; }
  get httpPort(): number | null { return this._browserManager?.httpPort ?? null; }

  isRunning(): boolean {
    return this._browserManager?.isRunning() ?? false;
  }

  /** Returns connection info for test runner, or undefined if not in headed mode. */
  async onWillRunTests(workspaceFolder?: string): Promise<{ connectWsEndpoint: string; resetTestServer: boolean; reusingBrowser: boolean } | undefined> {
    await this.ensureLaunched(workspaceFolder);
    if (!this._browserManager?.isRunning() || !this._browserManager.cdpUrl)
      return undefined;
    const cdpUrl = this._browserManager.cdpUrl;
    const httpPort = this._browserManager.httpPort;
    const needsReset = this._lastCdpUrl !== cdpUrl;
    this._lastCdpUrl = cdpUrl;
    if (httpPort)
      process.env.PW_BRIDGE_PORT = String(httpPort);
    return { connectWsEndpoint: cdpUrl, resetTestServer: needsReset, reusingBrowser: true };
  }

  onDidRunTests() {
    // If BrowserManager owns the browser, keep it alive — nothing to clean up
  }

  async ensureLaunched(workspaceFolder?: string) {
    if (!this._browserManager)
      this._browserManager = this._createBrowserManager(this._logger);
    if (this._browserManager.isRunning())
      return;
    if (this._launchPromise)
      return this._launchPromise;
    const resolvedFolder = workspaceFolder
      || this._vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._launchPromise = (async () => {
      try {
        await this._browserManager!.launch({
          browser: 'chromium',
          headless: false,
          workspaceFolder: resolvedFolder,
        });
        this._notifyViewsConnected();
      } finally {
        this._launchPromise = undefined;
      }
    })();
    return this._launchPromise;
  }

  async stop() {
    await this._browserManager?.stop();
    this._replView?.notifyBrowserDisconnected();
  }

  clearCdpUrl() {
    delete process.env.PW_BRIDGE_PORT;
    this._lastCdpUrl = undefined;
  }

  get lastCdpUrl(): string | undefined { return this._lastCdpUrl; }

  // ─── Recording ──────────────────────────────────────────────────────────

  async startRecording() {
    await this.ensureLaunched();
    if (!this._browserManager?.isRunning()) {
      this._vscode.window.showWarningMessage('Could not launch browser.');
      return;
    }
    if (!this._recorder)
      this._recorder = new Recorder(this._vscode, this._browserManager, this._logger);
    await this._recorder.start();
    this._settingsView?.setRecording(true);
  }

  stopRecording() {
    this._recorder?.stop();
    this._settingsView?.setRecording(false);
  }

  // ─── Picker ─────────────────────────────────────────────────────────────

  async pickLocator() {
    await this.ensureLaunched();
    if (!this._browserManager?.isRunning()) {
      this._vscode.window.showWarningMessage('Could not launch browser.');
      return;
    }
    this._ensurePicker();
    if (this._picker!.isPicking)
      await this._picker!.stop();
    else
      await this._picker!.start();
  }

  async assertBuilder() {
    await this.ensureLaunched();
    if (!this._browserManager?.isRunning()) {
      this._vscode.window.showWarningMessage('Could not launch browser.');
      return;
    }
    this._ensurePicker();
    await this._vscode.commands.executeCommand('playwright-repl.assertView.focus');
    if (!this._picker!.isPicking)
      await this._picker!.startForAssert();
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private _ensurePicker() {
    if (this._picker || !this._browserManager) return;
    this._picker = new Picker(this._vscode, this._browserManager, this._logger);
    if (this._locatorsView)
      this._picker.setLocatorsView(this._locatorsView);
    if (this._assertView) {
      this._picker.setAssertView(this._assertView);
      this._assertView.setPicker(this._picker);
    }
  }

  private _notifyViewsConnected() {
    if (!this._browserManager) return;
    if (this._replView) {
      this._replView.setBrowserManager(this._browserManager);
      this._replView.notifyBrowserConnected();
    }
    if (this._locatorsView)
      this._locatorsView.setBrowserManager(this._browserManager);
    if (this._assertView)
      this._assertView.setBrowserManager(this._browserManager);
  }
}
