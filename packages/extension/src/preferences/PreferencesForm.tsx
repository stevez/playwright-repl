import { useState, useEffect } from 'react';
import { loadSettings, storeSettings, loadAISettings, storeAISettings } from '../panel/lib/settings';
import type { PwReplSettings, AISettings, AIModelConfig, LlmProvider } from '../panel/lib/settings';

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250514',
  github: 'openai/gpt-4o',
  huggingface: 'meta-llama/Llama-3.1-70B-Instruct',
};

const PROVIDERS: { value: LlmProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'github', label: 'GitHub Models' },
  { value: 'huggingface', label: 'HuggingFace' },
];

export default function PreferencesForm() {
  const [settings, setSettings] = useState<PwReplSettings>({ openAs: 'sidepanel', bridgePort: 9876, languageMode: 'pw', commandTimeout: 15000 });
  const [aiSettings, setAiSettings] = useState<AISettings>({ models: [], activeModelId: '' });
  const [editModel, setEditModel] = useState<AIModelConfig | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
    loadAISettings().then(setAiSettings);
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
      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #444' }} />

      <h3 style={{ marginBottom: '12px' }}>AI Models</h3>

      {/* Configured models list */}
      {aiSettings.models.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '8px', border: '1px solid #444', borderRadius: '4px' }}>
          <input
            type="radio"
            name="activeModel"
            checked={aiSettings.activeModelId === m.id}
            onChange={() => {
              const next = { ...aiSettings, activeModelId: m.id };
              setAiSettings(next);
              storeAISettings(next);
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>{m.name}</div>
            <div style={{ fontSize: '11px', color: '#888' }}>{m.provider} / {m.model}</div>
          </div>
          <button onClick={() => setEditModel({ ...m })} style={{ fontSize: '12px', cursor: 'pointer' }}>Edit</button>
          <button onClick={() => {
            const models = aiSettings.models.filter(x => x.id !== m.id);
            const activeModelId = aiSettings.activeModelId === m.id ? (models[0]?.id ?? '') : aiSettings.activeModelId;
            const next = { models, activeModelId };
            setAiSettings(next);
            storeAISettings(next);
          }} style={{ fontSize: '12px', cursor: 'pointer', color: '#f88' }}>Delete</button>
        </div>
      ))}

      {/* Add / Edit form */}
      {editModel ? (
        <div style={{ padding: '12px', border: '1px solid #666', borderRadius: '4px', marginTop: '8px' }}>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '2px' }}>Name</label>
            <input value={editModel.name} onChange={e => setEditModel({ ...editModel, name: e.target.value })} style={{ width: '100%', padding: '4px 8px', fontSize: '13px' }} />
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '2px' }}>Provider</label>
            <select value={editModel.provider} onChange={e => {
              const provider = e.target.value as LlmProvider;
              setEditModel({ ...editModel, provider, model: DEFAULT_MODELS[provider] });
            }} style={{ width: '100%', padding: '4px 8px', fontSize: '13px' }}>
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '2px' }}>API Key</label>
            <input type="password" value={editModel.apiKey} onChange={e => setEditModel({ ...editModel, apiKey: e.target.value })} style={{ width: '100%', padding: '4px 8px', fontSize: '13px' }} />
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '2px' }}>Model</label>
            <input value={editModel.model} onChange={e => setEditModel({ ...editModel, model: e.target.value })} style={{ width: '100%', padding: '4px 8px', fontSize: '13px' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => {
              const existing = aiSettings.models.findIndex(m => m.id === editModel.id);
              const models = existing >= 0
                ? aiSettings.models.map(m => m.id === editModel.id ? editModel : m)
                : [...aiSettings.models, editModel];
              const activeModelId = aiSettings.activeModelId || editModel.id;
              const next = { models, activeModelId };
              setAiSettings(next);
              storeAISettings(next);
              setEditModel(null);
            }} style={{ fontSize: '12px', cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditModel(null)} style={{ fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditModel({
          id: crypto.randomUUID(),
          name: '',
          provider: 'github',
          apiKey: '',
          model: DEFAULT_MODELS.github,
        })} style={{ fontSize: '12px', cursor: 'pointer', marginTop: '8px' }}>+ Add Model</button>
      )}

      <p style={{ marginTop: '16px', fontSize: '12px', color: '#888' }}>Saved automatically.</p>
    </form>
  );
}
