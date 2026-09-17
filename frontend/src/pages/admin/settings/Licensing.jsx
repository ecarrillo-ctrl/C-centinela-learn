import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function Licensing() {
  const [settings, setSettings] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/admin/settings?category=licensing')
      .then(r => { setSettings(r.data.data?.licensing || {}); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  const modules = (settings.license_modules || '').split(',').filter(Boolean);
  const allModules = [
    { id: 'phishing', name: 'Phishing Simulado', icon: '\u{1F3A3}' },
    { id: 'training', name: 'Capacitación', icon: '\u{1F393}' },
    { id: 'pab', name: 'Phish Alert Button', icon: '\u{1F6A8}' },
    { id: 'reports', name: 'Informes y Analytics', icon: '\u{1F4CA}' },
    { id: 'asap', name: 'ASAP (Plan Automatizado)', icon: '\u{1F916}' },
    { id: 'physical_tests', name: 'Pruebas Físicas', icon: '\u{1F4BE}' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-title text-xl font-bold" style={{ color: '#001B71' }}>Módulos y Licenciamiento</h1>
        <p className="text-sm text-gray-500 mt-1">Plan activo, módulos habilitados y uso de licencias.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-gray-500">Plan activo</p>
            <p className="text-2xl font-bold" style={{ color: '#001B71' }}>
              {(settings.license_plan || 'enterprise').charAt(0).toUpperCase() + (settings.license_plan || 'enterprise').slice(1)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Usuarios máximos</p>
            <p className="text-2xl font-bold" style={{ color: '#00BC70' }}>
              {settings.license_max_users || '5000'}
            </p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-bold mb-3" style={{ color: '#001B71' }}>Módulos incluidos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allModules.map(m => {
              const active = modules.includes(m.id);
              return (
                <div key={m.id} className={`flex items-center gap-3 p-3 rounded-lg border ${active ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50 opacity-50'
                  }`}>
                  <span className="text-xl">{m.icon}</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#001B71' }}>{m.name}</p>
                    <p className="text-xs text-gray-400">{active ? 'Activo' : 'No incluido'}</p>
                  </div>
                  {active && <span className="ml-auto text-green-600 text-sm">{'\u2713'}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs text-blue-700">
          Para cambios en el licenciamiento, contacte al equipo de TI corporativo o al proveedor del servicio.
        </p>
      </div>
    </div>
  );
}
