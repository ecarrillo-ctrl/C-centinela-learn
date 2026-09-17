import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import UserMenu, { NotificationBell } from './UserMenu';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

export default function AdminLayout() {
  const { pathname } = useLocation();
  const flags = useFeatureFlags();
  const [physicalOpen, setPhysicalOpen] = useState(false);

  const links = [
    { to: '/admin', label: 'Tablero', exact: true },
    { to: '/admin/phishing', label: 'Phishing' },
    { to: '/admin/training', label: 'Capacitacion' },
    { to: '/admin/users', label: 'Usuarios' },
    ...(flags.asap ? [{ to: '/admin/asap', label: 'ASAP' }] : []),
  ];

  const isActive = (path) => {
    if (path.exact) return pathname === path.to;
    return pathname.startsWith(path.to);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5f5f0' }}>
      <header style={{ backgroundColor: '#001B71' }} className="text-white sticky top-0 z-30">
        {/* Top bar */}
        <div className="max-w-full mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button className="p-2 rounded-lg hover:bg-white/10 text-white/60" title="Selector de apps">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" /></svg>
            </button>
            <Link to="/admin" className="font-title text-base font-bold tracking-tight whitespace-nowrap hidden sm:block">
              eLearning AgroAmérica
            </Link>
          </div>

          {/* Main nav */}
          <nav className="flex items-center gap-0 overflow-x-auto scrollbar-none" role="navigation" aria-label="Navegacion de administracion">
            {links.map(l => (
              <Link key={l.to} to={l.to} aria-current={isActive(l) ? 'page' : undefined}
                className={`px-3 py-3 text-xs font-medium transition-colors whitespace-nowrap border-b-2 ${isActive(l)
                  ? 'border-green text-white'
                  : 'border-transparent text-white/60 hover:text-white hover:bg-white/10'
                  }`} style={isActive(l) ? { borderColor: '#00BC70' } : {}}>
                {l.label}
              </Link>
            ))}

            {/* Pruebas Fisicas dropdown */}
            {flags.physicalTests && (
              <div className="relative" onMouseEnter={() => setPhysicalOpen(true)} onMouseLeave={() => setPhysicalOpen(false)}>
                <button className={`px-3 py-3 text-xs font-medium transition-colors whitespace-nowrap border-b-2 flex items-center gap-1 ${pathname.startsWith('/admin/physical')
                  ? 'text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10 border-transparent'
                  }`} style={pathname.startsWith('/admin/physical') ? { borderColor: '#00BC70' } : {}}>
                  Pruebas Fisicas <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {physicalOpen && (
                  <div className="absolute left-0 top-full bg-white rounded-lg shadow-xl border border-gray-100 py-1 min-w-[180px] z-50">
                    <Link to="/admin/physical/usb" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">Prueba de USB</Link>
                    <Link to="/admin/physical/qr" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">QR fisico</Link>
                  </div>
                )}
              </div>
            )}

            <Link to="/admin/content" aria-current={pathname.startsWith('/admin/content') ? 'page' : undefined}
              className={`px-3 py-3 text-xs font-medium transition-colors whitespace-nowrap border-b-2 ${pathname.startsWith('/admin/content')
                ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/10 border-transparent'
                }`} style={pathname.startsWith('/admin/content') ? { borderColor: '#00BC70' } : {}}>
              Contenido
            </Link>

            <Link to="/admin/reports" aria-current={pathname === '/admin/reports' ? 'page' : undefined}
              className={`px-3 py-3 text-xs font-medium transition-colors whitespace-nowrap border-b-2 ${pathname === '/admin/reports'
                ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/10 border-transparent'
                }`} style={pathname === '/admin/reports' ? { borderColor: '#00BC70' } : {}}>
              Informes
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button className="p-2 rounded-lg hover:bg-white/10 text-white/50" title="Ayuda">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            <UserMenu isAdminView={true} />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
        <Outlet />
      </main>

      <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-200">
        eLearning AgroAmérica &copy; {new Date().getFullYear()} — AgroAmérica
      </footer>
    </div>
  );
}
