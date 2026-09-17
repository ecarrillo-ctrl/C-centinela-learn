import { useState, useEffect } from 'react';
import api from '../../lib/api';

export default function AdminCampaigns() {
  const [camps, setCamps] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ name: '', template_id: '', org_unit_scope: '' });

  useEffect(() => {
    api.get('/admin/phishing/campaigns').then(r => setCamps(r.data.data || [])).catch(() => {});
    api.get('/admin/phishing/templates').then(r => setTemplates(r.data.data || [])).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try { await api.post('/admin/phishing/campaigns', form); window.location.reload(); } catch {}
  };

  return (
    <div className="space-y-6">
      <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Campanas</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>Nueva campana de phishing</h2>
          <form onSubmit={create} className="space-y-3">
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              placeholder="Nombre" className="w-full border rounded-lg px-3 py-2 text-sm" required />
            <select value={form.template_id} onChange={e => setForm({...form, template_id: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm" required>
              <option value="">Seleccionar plantilla</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.difficulty})</option>)}
            </select>
            <button type="submit" className="w-full py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Crear campana</button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>Plantillas disponibles</h2>
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="p-3 rounded-lg border border-gray-50">
                <p className="text-sm font-medium" style={{ color: '#001B71' }}>{t.name}</p>
                <p className="text-xs text-gray-400">Asunto: {t.subject}</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{t.difficulty}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>Campanas ({camps.length})</h2>
        <div className="space-y-2">
          {camps.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-50">
              <div>
                <p className="text-sm font-medium" style={{ color: '#001B71' }}>{c.name}</p>
                <p className="text-xs text-gray-400">{c.template_name} &middot; {c.status}</p>
              </div>
              <div className="text-xs text-gray-500">
                {c.event_count} eventos &middot; {c.click_count} clicks
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
