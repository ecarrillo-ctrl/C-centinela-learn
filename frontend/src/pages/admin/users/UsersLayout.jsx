import { Link, Outlet, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/admin/users', end: true, label: 'Usuarios' },
  { to: '/admin/users/groups', label: 'Grupos' },
  { to: '/admin/users/import', label: 'Importar usuarios' },
  { to: '/admin/users/provisioning', label: 'Aprovisionamiento' },
  { to: '/admin/users/merge', label: 'Combinar usuarios' },
  { to: '/admin/users/messages', label: 'Mensajes' },
  { to: '/admin/users/security-roles', label: 'Funciones de seguridad' },
];

export default function UsersLayout() {
  const { pathname } = useLocation();
  const isActive = (tab) => (tab.end ? pathname === tab.to : pathname.startsWith(tab.to));

  return (
    <div className="space-y-6">
      <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Administrar usuarios</h1>

      <div className="flex gap-0 border-b border-gray-200 overflow-x-auto">
        {TABS.map(tab => (
          <Link key={tab.to} to={tab.to}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${isActive(tab) ? 'border-[#001B71] text-[#001B71]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
            {tab.label}
          </Link>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
