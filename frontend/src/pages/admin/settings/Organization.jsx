import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function Organization() {
  const [settings, setSettings] = useState({});
  const [orgs, setOrgs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/admin/settings?category=organization'),
      api.get('/admin/organizations').catch(() => ({ data: { data: [] } })),
    ]).then(([settingsRes, orgsRes]) => {
      setSettings(settingsRes.data.data?.organization || {});
      setOrgs(orgsRes.data.data || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings', { settings });
      alert('Información guardada');
    } catch { alert('Error al guardar'); }
    setSaving(false);
  };

  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-title text-xl font-bold" style={{ color: '#001B71' }}>Información de la organización</h1>
        <p className="text-sm text-gray-500 mt-1">Datos generales del grupo corporativo.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Nombre de la organización</label>
            <input value={settings.org_name || ''} onChange={e => setSettings({ ...settings, org_name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Industria</label>
            <input value={settings.org_industry || ''} onChange={e => setSettings({ ...settings, org_industry: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Número de empleados</label>
            <input value={settings.org_employees || ''} onChange={e => setSettings({ ...settings, org_employees: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">País sede</label>
            <input value={settings.org_country || ''} onChange={e => setSettings({ ...settings, org_country: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#001B71' }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* Organizations from AD */}
      {orgs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>
            Empresas del grupo ({orgs.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {orgs.map(org => (
              <div key={org.id || org.ID} className="p-3 rounded-lg border border-gray-100">
                <p className="text-sm font-medium" style={{ color: '#001B71' }}>{org.name || org.NAME}</p>
                <p className="text-xs text-gray-400">{org.country || org.COUNTRY || '—'}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${(org.is_active || org.IS_ACTIVE) === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{(org.is_active || org.IS_ACTIVE) === 1 ? 'Activa' : 'Inactiva'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
