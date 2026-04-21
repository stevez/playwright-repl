import { useState, useEffect } from 'react';
import { loadSettings, storeSettings } from '../panel/lib/settings';
import type { PwReplSettings } from '../panel/lib/settings';

export default function PreferencesForm() {
  const [settings, setSettings] = useState<PwReplSettings>({ openAs: 'sidepanel', bridgePort: 9876, languageMode: 'pw', commandTimeout: 15000 });

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  function handleChange(openAs: PwReplSettings['openAs']) {
    const next = { ...settings, openAs };
    setSettings(next);
    storeSettings(next);
  }

  function handleChangeLanguageMode(languageMode: PwReplSettings['languageMode']) {
    const next = { ...settings, languageMode };
    setSettings(next);
    storeSettings(next);
  }
  return (
    <form style={{ fontFamily: 'system-ui, sans-serif', padding: '24px', maxWidth: '400px' }}>
      <h2 style={{ marginTop: 0 }}>Playwright REPL Preferences</h2>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: '12px' }}>Open REPL as:</legend>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="openAs"
            value="sidepanel"
            checked={settings.openAs === 'sidepanel'}
            onChange={() => handleChange('sidepanel')}
          />
          Side Panel (default)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="openAs"
            value="popup"
            checked={settings.openAs === 'popup'}
            onChange={() => handleChange('popup')}
          />
          Popup Window
        </label>
      </fieldset>
      <fieldset style={{ border: 'none', padding: 0, margin: '20px 0 0' }}>
        <legend style={{ fontWeight: 600, marginBottom: '12px' }}>Bridge Port:</legend>
        <input
          type="number"
          value={settings.bridgePort}
          onChange={(e) => {
            const next = { ...settings, bridgePort: Number(e.target.value) };
            setSettings(next);
            storeSettings(next);
          }}
          style={{ width: '100px', padding: '4px 8px', fontSize: '14px' }}
        />
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#888' }}>
          Port the MCP server listens on (default: 9876). Reopen the panel after changing.
        </p>
      </fieldset>
      <fieldset style={{ border: 'none', padding: 0, margin: '20px 0 0' }}>
        <legend style={{ fontWeight: 600, marginBottom: '12px' }}>Language Mode:</legend>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="languageMode"
            value="pw"
            checked={settings.languageMode === 'pw'}
            onChange={() => handleChangeLanguageMode('pw')}
          />
          pw (default)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="languageMode"
            value="js"
            checked={settings.languageMode === 'js'}
            onChange={() => handleChangeLanguageMode('js')}
          />
          js
        </label>
      </fieldset>
      <fieldset style={{ border: 'none', padding: 0, margin: '20px 0 0' }}>
        <legend style={{ fontWeight: 600, marginBottom: '12px' }}>Command Timeout (seconds):</legend>
        <input
          type="number"
          min={1}
          max={300}
          value={settings.commandTimeout / 1000}
          onChange={(e) => {
            const next = { ...settings, commandTimeout: Number(e.target.value) * 1000 };
            setSettings(next);
            storeSettings(next);
          }}
          style={{ width: '100px', padding: '4px 8px', fontSize: '14px' }}
        />
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#888' }}>
          Max time a command can run before timing out (default: 15).
        </p>
      </fieldset>
      <p style={{ marginTop: '16px', fontSize: '12px', color: '#888' }}>Saved automatically.</p>
    </form>
  );
}
