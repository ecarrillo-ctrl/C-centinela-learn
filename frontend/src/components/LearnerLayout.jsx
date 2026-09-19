import { Link, Outlet, useLocation } from 'react-router-dom';
import UserMenu from './UserMenu';
import PABButton from './PABButton';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

export default function LearnerLayout() {
  const { pathname } = useLocation();
  const flags = useFeatureFlags();

  const links = [
    { to: '/', label: 'Tablero', exact: true },
    { to: '/training', label: 'Capacitacion' },
    { to: '/library', label: 'Biblioteca' },
    { to: '/badges', label: 'Logros' },
    { to: '/messages', label: 'Mensajes' },
    ...(flags.mobileApp ? [{ to: '/mobile-app', label: 'App movil' }] : []),
  ];

  const isActive = (l) => l.exact ? pathname === l.to : pathname.startsWith(l.to);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5f5f0' }}>
      <header style={{ backgroundColor: '#001B71' }} className="text-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Link to="/" className="font-title text-base font-bold tracking-tight whitespace-nowrap">
              eLearning AgroAmérica
            </Link>
          </div>

          <nav className="flex items-center gap-0 overflow-x-auto scrollbar-none" role="navigation" aria-label="Navegacion del aprendiz">
            {links.map(l => (
              <Link key={l.to} to={l.to} aria-current={isActive(l) ? 'page' : undefined}
                className={`px-3 py-3 text-xs font-medium transition-colors whitespace-nowrap border-b-2 ${isActive(l)
                  ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/10 border-transparent'
                  }`} style={isActive(l) ? { borderColor: '#00BC70' } : {}}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <PABButton />
            <UserMenu isAdminView={false} />
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
