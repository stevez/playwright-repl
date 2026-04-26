import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

const mockLoadSettings = vi.fn();
const mockStoreSettings = vi.fn();

vi.mock('../../src/panel/lib/settings', () => ({
    loadSettings: () => mockLoadSettings(),
    storeSettings: (...args: unknown[]) => mockStoreSettings(...args),
}));

import PreferencesForm from '../../src/preferences/PreferencesForm';

beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockResolvedValue({ openAs: 'sidepanel', bridgePort: 9876, languageMode: 'pw', commandTimeout: 15000 });
    mockStoreSettings.mockResolvedValue(undefined);
});

describe('PreferencesForm', () => {
    it('renders heading', async () => {
        const screen = await render(<PreferencesForm />);
        await expect.element(screen.getByText('Playwright REPL Preferences')).toBeInTheDocument();
    });

    it('renders Open REPL as fieldset', async () => {
        const screen = await render(<PreferencesForm />);
        await expect.element(screen.getByText('Open REPL as:')).toBeInTheDocument();
        await expect.element(screen.getByText('Side Panel (default)')).toBeInTheDocument();
        await expect.element(screen.getByText('Popup Window')).toBeInTheDocument();
    });

    it('has sidepanel radio checked by default', async () => {
        const screen = await render(<PreferencesForm />);
        const sidepanelRadio = screen.getByRole('radio', { name: /Side Panel/ });
        await expect.element(sidepanelRadio).toBeChecked();
    });

    it('calls storeSettings when openAs changed to popup', async () => {
        const screen = await render(<PreferencesForm />);
        const popupRadio = screen.getByRole('radio', { name: /Popup Window/ });
        await userEvent.click(popupRadio);
        await vi.waitFor(() => {
            expect(mockStoreSettings).toHaveBeenCalledWith(
                expect.objectContaining({ openAs: 'popup' }),
            );
        });
    });

    it('renders Bridge Port fieldset with default value', async () => {
        const screen = await render(<PreferencesForm />);
        await expect.element(screen.getByText('Bridge Port:')).toBeInTheDocument();
        const input = screen.getByRole('group', { name: 'Bridge Port:' }).getByRole('spinbutton');
        await expect.element(input).toHaveValue(9876);
    });

    it('calls storeSettings when bridge port changed', async () => {
        const screen = await render(<PreferencesForm />);
        const input = screen.getByRole('group', { name: 'Bridge Port:' }).getByRole('spinbutton');
        await userEvent.clear(input);
        await userEvent.type(input, '1234');
        await vi.waitFor(() => {
            expect(mockStoreSettings).toHaveBeenCalled();
        });
    });

    it('renders Language Mode fieldset', async () => {
        const screen = await render(<PreferencesForm />);
        await expect.element(screen.getByText('Language Mode:')).toBeInTheDocument();
        const pwRadio = screen.getByRole('radio', { name: /^pw/ });
        await expect.element(pwRadio).toBeChecked();
    });

    it('calls storeSettings when language mode changed to js', async () => {
        const screen = await render(<PreferencesForm />);
        const jsRadio = screen.getByRole('radio', { name: /^js$/ });
        await userEvent.click(jsRadio);
        await vi.waitFor(() => {
            expect(mockStoreSettings).toHaveBeenCalledWith(
                expect.objectContaining({ languageMode: 'js' }),
            );
        });
    });

    it('renders Command Timeout fieldset with default value in seconds', async () => {
        const screen = await render(<PreferencesForm />);
        await expect.element(screen.getByText('Command Timeout (seconds):')).toBeInTheDocument();
        const input = screen.getByRole('group', { name: 'Command Timeout (seconds):' }).getByRole('spinbutton');
        await expect.element(input).toHaveValue(15);
    });

    it('calls storeSettings when command timeout changed', async () => {
        const screen = await render(<PreferencesForm />);
        const input = screen.getByRole('group', { name: 'Command Timeout (seconds):' }).getByRole('spinbutton');
        await userEvent.clear(input);
        await userEvent.type(input, '30');
        await vi.waitFor(() => {
            expect(mockStoreSettings).toHaveBeenCalledWith(
                expect.objectContaining({ commandTimeout: 30000 }),
            );
        });
    });

    it('shows saved automatically text', async () => {
        const screen = await render(<PreferencesForm />);
        await expect.element(screen.getByText('Saved automatically.')).toBeInTheDocument();
    });
});
