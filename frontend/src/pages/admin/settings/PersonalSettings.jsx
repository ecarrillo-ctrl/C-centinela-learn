import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';

export default function PersonalSettings() {
  const { user } = useAuth();
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'es');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [notifications, setNotifications] = useState({
    email_training: true,
    email_phishing_results: true,
    email_weekly_digest: true,
    browser_push: false,
  });

  const saveLang = (newLang) => {
    setLang(newLang);
    localStorage.setItem('lang', newLang);
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-title text-xl font-bold" style={{ color: '#001B71' }}>Configuración personal</h1>
        <p className="text-sm text-gray-500 mt-1">Preferencias de idioma, zona horaria y notificaciones.</p>
      </div>

      {/* Profile info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
            style={{ backgroundColor: '#00BC70', color: '#001B71' }}>
            {user?.displayName?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="font-bold" style={{ color: '#001B71' }}>{user?.displayName}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Los datos personales se sincronizan desde Active Directory. Para cambios, contacte al equipo de TI.
        </p>
      </div>

      {/* Language */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-bold mb-3" style={{ color: '#001B71' }}>Idioma</h3>
        <div className="flex gap-3">
          {[
            { code: 'es', label: 'Español', flag: '\u{1F1EC}\u{1F1F9}' },
            { code: 'en', label: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
          ].map(l => (
            <button key={l.code} onClick={() => saveLang(l.code)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${lang === l.code ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`} style={lang === l.code ? { color: '#001B71' } : {}}>
              <span>{l.flag}</span> {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timezone */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-bold mb-3" style={{ color: '#001B71' }}>Zona horaria</h3>
        <select value={timezone} onChange={e => setTimezone(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="America/Guatemala">America/Guatemala (GMT-6)</option>
          <option value="America/Costa_Rica">America/Costa_Rica (GMT-6)</option>
          <option value="America/Panama">America/Panama (GMT-5)</option>
          <option value="America/Bogota">America/Bogota (GMT-5)</option>
          <option value="America/Mexico_City">America/Mexico_City (GMT-6)</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">Detectada automáticamente: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-bold mb-3" style={{ color: '#001B71' }}>Notificaciones por correo</h3>
        <div className="space-y-3">
          {[
            { key: 'email_training', label: 'Recordatorios de capacitación', desc: 'Vencimientos y nuevas asignaciones' },
            { key: 'email_phishing_results', label: 'Resultados de phishing', desc: 'Cuando se completa una campaña' },
            { key: 'email_weekly_digest', label: 'Resumen semanal', desc: 'Estadísticas generales cada lunes' },
            { key: 'browser_push', label: 'Push en navegador', desc: 'Alertas en tiempo real (experimental)' },
          ].map(n => (
            <div key={n.key} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">{n.label}</p>
                <p className="text-xs text-gray-400">{n.desc}</p>
              </div>
              <button onClick={() => setNotifications(prev => ({ ...prev, [n.key]: !prev[n.key] }))}
                className={`w-10 h-5 rounded-full transition-colors relative ${notifications[n.key] ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${notifications[n.key] ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
