import { useEffect, useState } from 'react';
import { galleryApi } from '../api.js';

const initial = { baseUrl: '', model: '', timeoutMs: 30000, apiKeyConfigured: false };

export default function SettingsPage() {
  const [settings, setSettings] = useState(initial);
  const [apiKey, setApiKey] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    galleryApi.visionSettings()
      .then(setSettings)
      .catch((failure) => setError(failure.message))
      .finally(() => setLoading(false));
  }, []);

  const update = (field, value) => setSettings((current) => ({ ...current, [field]: value }));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setNotice(''); setError('');
    try {
      const saved = await galleryApi.saveVisionSettings({
        baseUrl: settings.baseUrl, model: settings.model, timeoutMs: settings.timeoutMs, apiKey,
      });
      setSettings(saved); setApiKey(''); setNotice('设置已保存');
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  };

  return <section className="settings-page">
    <header className="page-heading"><div><p className="eyebrow">GALLERY PREFERENCES</p><h2>设置</h2></div></header>
    <form className="settings-card" onSubmit={save}>
      <div className="settings-title"><span className="settings-icon">◌</span><div><h3>视觉描述模型</h3><p>只负责整理画面里直接可见的内容。</p></div></div>
      {loading ? <p className="muted">正在读取设置…</p> : <>
        <label>API Base URL<input type="url" value={settings.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} placeholder="https://…/v1" /></label>
        <label>API Key<div className="key-input"><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.apiKeyConfigured ? '已配置，留空则保持不变' : '填写 API Key'} />{settings.apiKeyConfigured && <small>已配置</small>}</div></label>
        <label>Model<input value={settings.model} onChange={(event) => update('model', event.target.value)} placeholder="deepseek-flash" /></label>
        <label>Timeout (ms)<input type="number" min="1000" step="1000" value={settings.timeoutMs} onChange={(event) => update('timeoutMs', Number(event.target.value))} /></label>
        <div className="form-footer">{error && <p className="field-error">{error}</p>}{notice && <p className="success-note">{notice}</p>}<button disabled={saving}>{saving ? '保存中…' : '保存设置'}</button></div>
      </>}
    </form>
  </section>;
}
