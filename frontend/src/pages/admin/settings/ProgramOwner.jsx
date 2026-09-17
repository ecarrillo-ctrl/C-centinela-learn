import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function ProgramOwner() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/admin/settings?category=account')
      .then(r => { setSettings(r.data.data?.account || {}); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings', { settings });
      alert('Configuración guardada');
    } catch { alert('Error al guardar'); }
    setSaving(false);
  };

  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-title text-xl font-bold" style={{ color: '#001B71' }}>Responsable del programa</h1>
        <p className="text-sm text-gray-500 mt-1">Líder interno del programa de concientización en ciberseguridad.</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nombre" value={settings.program_owner_name}
            onChange={v => setSettings({ ...settings, program_owner_name: v })} />
          <Field label="Correo electrónico" value={settings.program_owner_email}
            onChange={v => setSettings({ ...settings, program_owner_email: v })} />
          <Field label="Teléfono" value={settings.program_owner_phone}
            onChange={v => setSettings({ ...settings, program_owner_phone: v })} />
          <Field label="Ubicación" value={settings.program_owner_location}
            onChange={v => setSettings({ ...settings, program_owner_location: v })} />
        </div>
        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-3">
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#001B71' }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <span className="text-xs text-gray-400">Los cambios se aplican inmediatamente.</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-600">{label}</label>
      <input value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
    </div>
  );
}
