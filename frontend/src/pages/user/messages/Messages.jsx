import { useState, useEffect } from 'react';
import api from '../../../lib/api';

const CATEGORY_STYLES = {
  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: '\u{2139}\u{FE0F}', color: 'text-blue-700' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: '\u{26A0}\u{FE0F}', color: 'text-amber-700' },
  success: { bg: 'bg-green-50', border: 'border-green-200', icon: '\u{2705}', color: 'text-green-700' },
  security: { bg: 'bg-red-50', border: 'border-red-200', icon: '\u{1F6E1}\u{FE0F}', color: 'text-red-700' },
  training: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: '\u{1F393}', color: 'text-indigo-700' },
  phishing: { bg: 'bg-orange-50', border: 'border-orange-200', icon: '\u{1F3A3}', color: 'text-orange-700' },
};

export default function Messages() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadNotifications(); }, [filter]);

  async function loadNotifications() {
    setLoading(true);
    try {
      const params = filter === 'unread' ? '?unread=true' : '';
      const { data } = await api.get(`/notifications${params}`);
      setNotifications(data.data || []);
      setUnreadCount(data.unread_count || 0);
      setTotal(data.total || 0);
    } catch { }
    setLoading(false);
  }

  async function markRead(id) {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n =>
        (n.id || n.ID) === id ? { ...n, is_read: 1, IS_READ: 1 } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { }
  }

  async function markAllRead() {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1, IS_READ: 1 })));
      setUnreadCount(0);
    } catch { }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Mensajes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Notificaciones, alertas de seguridad y comunicados del equipo de ciberseguridad.
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50">
            Marcar todo como leído ({unreadCount})
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {[
          { id: 'all', label: `Todos (${total})` },
          { id: 'unread', label: `Sin leer (${unreadCount})` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setFilter(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${filter === tab.id ? 'border-[#001B71] text-[#001B71]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando mensajes...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-5xl mb-4 block">{'\u{1F4EC}'}</span>
          <p className="text-gray-400">No hay mensajes {filter === 'unread' ? 'sin leer' : ''}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => {
            const id = n.id || n.ID;
            const title = n.title || n.TITLE;
            const body = n.body || n.BODY;
            const category = n.category || n.CATEGORY || 'info';
            const isRead = (n.is_read || n.IS_READ) === 1;
            const createdAt = n.created_at || n.CREATED_AT;
            const linkUrl = n.link_url || n.LINK_URL;
            const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.info;

            return (
              <div key={id}
                className={`rounded-xl border p-4 transition-all ${isRead ? 'bg-white border-gray-100' : `${style.bg} ${style.border}`}`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className={`text-sm font-medium ${isRead ? 'text-gray-700' : style.color}`}>
                        {title}
                      </h3>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {createdAt ? new Date(createdAt).toLocaleDateString('es-GT', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        }) : ''}
                      </span>
                    </div>
                    {body && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{body}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      {!isRead && (
                        <button onClick={() => markRead(id)}
                          className="text-xs font-medium hover:underline" style={{ color: '#001B71' }}>
                          Marcar como leído
                        </button>
                      )}
                      {linkUrl && (
                        <a href={linkUrl} className="text-xs font-medium hover:underline" style={{ color: '#2B5597' }}>
                          Ver detalle →
                        </a>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{category}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Security tips section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>
          Consejos de seguridad
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: '\u{1F512}', tip: 'Use contraseñas únicas para cada servicio y active 2FA cuando esté disponible.' },
            { icon: '\u{1F4E7}', tip: 'Verifique el remitente antes de hacer clic en enlaces de correos inesperados.' },
            { icon: '\u{1F4BE}', tip: 'Nunca conecte dispositivos USB desconocidos a su computadora corporativa.' },
            { icon: '\u{1F4F1}', tip: 'Mantenga actualizados sus dispositivos y aplicaciones.' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-xl">{item.icon}</span>
              <p className="text-xs text-gray-600">{item.tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
