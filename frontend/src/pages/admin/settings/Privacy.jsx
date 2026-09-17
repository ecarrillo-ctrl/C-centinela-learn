import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function Privacy() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/admin/settings?category=privacy')
      .then(r => { setSettings(r.data.data?.privacy || {}); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings', { settings });
      alert('Configuración de privacidad guardada');
    } catch { alert('Error al guardar'); }
    setSaving(false);
  };

  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-title text-xl font-bold" style={{ color: '#001B71' }}>Privacidad de la cuenta</h1>
        <p className="text-sm text-gray-500 mt-1">Anonimización de reportes y retención de datos.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div>
          <label className="text-sm font-medium text-gray-600">Anonimizar reportes</label>
          <select value={settings.privacy_anonymize_reports || '0'}
            onChange={e => setSettings({ ...settings, privacy_anonymize_reports: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1">
            <option value="0">No — mostrar nombres completos en reportes</option>
            <option value="1">Sí — ocultar nombres en exportaciones PDF/CSV</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Si se activa, los reportes exportados mostrarán identificadores anónimos en lugar de nombres reales.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Retención de datos (días)</label>
          <input type="number" value={settings.privacy_data_retention_days || '730'}
            onChange={e => setSettings({ ...settings, privacy_data_retention_days: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" min="90" max="3650" />
          <p className="text-xs text-gray-400 mt-1">
            Los datos de phishing results y quiz attempts se purgarán después de este período. Mínimo: 90 días.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
          <h4 className="text-sm font-bold text-amber-800 mb-2">Cumplimiento regulatorio</h4>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            <li>Los datos de usuarios provienen del Active Directory corporativo</li>
            <li>No se almacenan contraseñas (autenticación via Cloudflare Access SSO)</li>
            <li>Los logs de auditoría se conservan independientemente de esta configuración</li>
            <li>Consulte con el DPO antes de reducir los períodos de retención</li>
          </ul>
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#001B71' }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
