import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

export default function UserMenu({ isAdminView }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const loc = useLocation();
  const currentLang = localStorage.getItem('lang') || 'es';

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  useEffect(() => { setOpen(false); }, [loc.pathname]);

  const toggleLang = () => {
    const next = currentLang === 'es' ? 'en' : 'es';
    localStorage.setItem('lang', next);
    window.location.reload();
  };

  const initials = user?.displayName?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  return (
    <div className="relative" ref={ref}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-white/10 text-white/80">
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: '#00BC70', color: '#001B71' }}>{initials}</span>
        <span className="hidden sm:inline">{user?.displayName}</span>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold" style={{ color: '#001B71' }}>{user?.displayName}</p>
            <p className="text-xs text-gray-400">{user?.email}</p>
            <p className="text-xs mt-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: user?.isAdmin ? '#2B5597' : '#D1CCBD', color: user?.isAdmin ? 'white' : '#001B71' }}>
                {user?.isAdmin ? 'Administrador' : 'Colaborador'}
              </span>
            </p>
          </div>

          {/* Perfil — siempre */}
          <MenuLink to="/profile" icon={'\u{1F464}'} label="Perfil" />

          {/* ADMIN MENU */}
          {isAdminView ? (
            <>
              <MenuLink to="/admin/settings/personal" icon={'\u{1F6E0}\u{FE0F}'} label="Configuracion personal" />
              <MenuLink to="/admin/settings" icon={'\u{2699}\u{FE0F}'} label="Configuracion de la cuenta" />
              <MenuLink to="/admin/audit-log" icon={'\u{1F4CB}'} label="Registro de auditoria" />
              <hr className="my-1 border-gray-100" />
              <MenuBtn icon={'\u{1F3C3}'} label="Iniciar el recorrido" onClick={() => { setOpen(false); alert('Tour guiado proximamente.'); }} />
              <MenuBtn icon={'\u{1F310}'} label={`Idioma: ${currentLang === 'es' ? 'Espanol' : 'English'}`} onClick={toggleLang} />
              <hr className="my-1 border-gray-100" />
              <MenuLink to="/learn" icon={'\u{1F3E0}'} label="Portal del aprendiz" bold forceReload />
            </>
          ) : (
            <>
              {/* LEARNER MENU */}
              <MenuLink to="/learn" icon={'\u{1F393}'} label="Mi capacitacion" />
              <hr className="my-1 border-gray-100" />
              <MenuBtn icon={'\u{1F3C3}'} label="Iniciar el recorrido" onClick={() => { setOpen(false); alert('Tour guiado proximamente.'); }} />
              <MenuBtn icon={'\u{1F310}'} label={`Idioma: ${currentLang === 'es' ? 'Espanol' : 'English'}`} onClick={toggleLang} />
              {(user?.isAdmin || user?.is_admin === 1) && (
                <>
                  <hr className="my-1 border-gray-100" />
                  <MenuLink to="/admin" icon={'\u{2699}'} label="Ir a la consola de administracion" bold forceReload />
                </>
              )}
            </>
          )}

          <hr className="my-1 border-gray-100" />
          <MenuBtn icon={'\u{1F6AA}'} label="Cerrar sesion" danger onClick={() => { setOpen(false); logout(); }} />
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, icon, label, bold, forceReload }) {
  if (forceReload) {
    return (
      <a href={to} className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${bold ? 'font-medium' : 'text-gray-700'} hover:bg-gray-50`}
        style={bold ? { color: '#2B5597' } : {}}>
        <span>{icon}</span> {label}
      </a>
    );
  }
  return (
    <Link to={to} className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${bold ? 'font-medium' : 'text-gray-700'} hover:bg-gray-50`}
      style={bold ? { color: '#2B5597' } : {}}>
      <span>{icon}</span> {label}
    </Link>
  );
}

function MenuBtn({ icon, label, onClick, bold, danger }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${danger ? 'text-red-600 hover:bg-red-50' : bold ? 'font-medium hover:bg-gray-50' : 'text-gray-700 hover:bg-gray-50'
        }`}
      style={bold && !danger ? { color: '#2B5597' } : {}}>
      <span>{icon}</span> {label}
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef(null);
  const loc = useLocation();

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  async function loadNotifications() {
    try {
      const { data } = await api.get('/notifications?limit=10');
      setNotifications(data.data || []);
      setUnreadCount(data.unread_count || 0);
    } catch { }
  }

  async function markRead(id) {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => (n.id || n.ID) === id ? { ...n, is_read: 1, IS_READ: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { }
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="relative p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 max-h-96 overflow-auto" onClick={e => e.stopPropagation()}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: '#001B71' }}>Notificaciones</p>
            {unreadCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">{unreadCount} nuevas</span>}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-xs">Sin notificaciones</div>
          ) : (
            notifications.map(n => {
              const id = n.id || n.ID;
              const isRead = (n.is_read || n.IS_READ) === 1;
              return (
                <div key={id} onClick={() => !isRead && markRead(id)}
                  className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!isRead ? 'bg-blue-50/50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${!isRead ? 'font-medium' : 'text-gray-600'}`}>{n.title || n.TITLE}</p>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(n.created_at || n.CREATED_AT)}</span>
                  </div>
                  {(n.body || n.BODY) && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{n.body || n.BODY}</p>}
                </div>
              );
            })
          )}
          <Link to="/admin/audit-log" className="block px-4 py-2.5 text-xs font-medium text-center hover:bg-gray-50" style={{ color: '#2B5597' }}>
            Ver todo el registro
          </Link>
        </div>
      )}
    </div>
  );
}
