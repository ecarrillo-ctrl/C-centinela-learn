import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';

const SECTIONS = [
  {
    group: 'Informacion de la cuenta',
    defaultOpen: true,
    items: [
      { to: '/admin/settings', end: true, label: 'Responsable del programa', icon: '\u{1F464}' },
      { to: '/admin/settings/personal', label: 'Configuracion personal', icon: '\u{1F6E0}\u{FE0F}' },
      { to: '/admin/settings/licensing', label: 'Modulos y licenciamiento', icon: '\u{1F4E6}' },
      { to: '/admin/settings/privacy', label: 'Privacidad de la cuenta', icon: '\u{1F512}' },
      { to: '/admin/settings/organization', label: 'Informacion de la organizacion', icon: '\u{1F3E2}' },
      { to: '/admin/settings/branding', label: 'Marca', icon: '\u{1F3A8}' },
      { to: '/admin/settings/placeholders', label: 'Marcadores de posicion', icon: '\u{1F4DD}' },
    ],
  },
  { group: 'Administracion de usuarios', items: [{ to: '/admin/settings/user-management', label: 'Proveedor de sincronizacion', icon: '\u{1F465}' }] },
  { group: 'Phishing', items: [{ to: '/admin/settings/phishing', label: 'Ajustes de campanas', icon: '\u{1F3A3}' }] },
  { group: 'Capacitacion', items: [{ to: '/admin/settings/training', label: 'Ajustes de capacitacion', icon: '\u{1F393}' }] },
  { group: 'Integraciones de la cuenta', items: [{ to: '/admin/settings/integrations', label: 'AD / SMTP / Cloudflare', icon: '\u{1F517}' }] },
  { group: 'Informes', items: [{ to: '/admin/settings/reports', label: 'Preferencias de reporteria', icon: '\u{1F4CA}' }] },
];

export default function SettingsLayout() {
  const { pathname } = useLocation();
  const flags = useFeatureFlags();
  const [openGroups, setOpenGroups] = useState({ 'Informacion de la cuenta': true });

  const toggle = (group) => setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));

  const allSections = [...SECTIONS];
  if (flags.labs) {
    allSections.push({ group: 'Laboratorio', items: [{ to: '/admin/settings/labs', label: 'Funciones experimentales', icon: '\u{1F9EA}' }] });
  }

  return (
    <div className="flex gap-6">
      <aside className="w-64 flex-shrink-0 hidden lg:block">
        <nav className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden sticky top-20">
          {allSections.map(s => (
            <div key={s.group}>
              <button onClick={() => toggle(s.group)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-400 hover:bg-gray-50 transition-colors">
                {s.group}
                <svg className={`w-3 h-3 transition-transform ${openGroups[s.group] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openGroups[s.group] && (
                <div className="border-b border-gray-50">
                  {s.items.map(item => (
                    <Link key={item.to} to={item.to} end={item.end}
                      className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                        item.end ? pathname === item.to : pathname.startsWith(item.to)
                          ? 'font-medium'
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                      style={item.end ? (pathname === item.to ? { color: '#001B71', backgroundColor: '#f0f2ff' } : {}) : (pathname.startsWith(item.to) ? { color: '#001B71', backgroundColor: '#f0f2ff' } : {})}>
                      <span className="text-base">{item.icon}</span> {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
