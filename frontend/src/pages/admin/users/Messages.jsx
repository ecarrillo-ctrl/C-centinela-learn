import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function Messages() {
  const [history, setHistory] = useState([]);
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', category: 'info', target_scope: 'all', user_id: '', group: '' });
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadHistory();
    api.get('/admin/groups/all').then(r => setGroups(r.data.data || [])).catch(() => { });
  }, []);

  function loadHistory() {
    api.get('/admin/notifications/all').then(r => setHistory(r.data.data || [])).catch(() => { });
  }

  async function searchUsers(q) {
    setUserSearch(q);
    if (q.length < 2) { setUserResults([]); return; }
    try {
      const { data } = await api.get(`/admin/users?search=${encodeURIComponent(q)}&limit=10&status=active`);
      setUserResults(data.data || []);
    } catch { }
  }

  async function send(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const payload = { title: form.title, body: form.body, category: form.category, target_scope: form.target_scope };
      if (form.target_scope === 'user') payload.user_id = selectedUser?.id;
      if (form.target_scope === 'group') payload.group = form.group;

      const { data } = await api.post('/admin/notifications/create', payload);
      alert(data.sent_to !== undefined ? `Mensaje enviado a ${data.sent_to} destinatarios` : 'Mensaje enviado');
      setForm({ title: '', body: '', category: 'info', target_scope: 'all', user_id: '', group: '' });
      setSelectedUser(null);
      loadHistory();
    } catch (err) { alert(err.response?.data?.error || 'Error al enviar'); }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-title font-bold mb-4" style={{ color: '#001B71' }}>Nuevo mensaje</h3>
        <form onSubmit={send} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje</label>
            <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm h-24" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="info">Info</option>
                <option value="warning">Advertencia</option>
                <option value="success">Éxito</option>
                <option value="security">Seguridad</option>
                <option value="training">Capacitación</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destinatarios</label>
              <select value={form.target_scope} onChange={e => setForm({ ...form, target_scope: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="all">Todos</option>
                <option value="admins">Solo administradores</option>
                <option value="group">Un grupo</option>
                <option value="user">Un usuario</option>
              </select>
            </div>
          </div>

          {form.target_scope === 'group' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grupo</label>
              <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">Seleccionar grupo...</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.member_count || 0})</option>)}
              </select>
            </div>
          )}

          {form.target_scope === 'user' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
              {selectedUser ? (
                <div className="flex items-center justify-between p-2 rounded-lg border border-gray-100">
                  <div>
                    <p className="text-sm font-medium">{selectedUser.display_name}</p>
                    <p className="text-xs text-gray-400">{selectedUser.email}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedUser(null)} className="text-xs text-gray-400 hover:text-gray-600">Cambiar</button>
                </div>
              ) : (
                <>
                  <input value={userSearch} onChange={e => searchUsers(e.target.value)} placeholder="Buscar usuario..."
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <div className="max-h-32 overflow-auto mt-1 space-y-1">
                    {userResults.map(u => (
                      <button key={u.id} type="button" onClick={() => { setSelectedUser(u); setUserSearch(''); setUserResults([]); }}
                        className="w-full text-left p-2 rounded-lg border border-gray-100 hover:bg-gray-50 text-sm">
                        {u.display_name} <span className="text-xs text-gray-400">({u.email})</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <button type="submit" disabled={busy || (form.target_scope === 'user' && !selectedUser)}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: '#001B71' }}>
            {busy ? 'Enviando...' : 'Enviar mensaje'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-title font-bold mb-3" style={{ color: '#001B71' }}>Historial de mensajes</h3>
        <div className="space-y-2 max-h-96 overflow-auto">
          {history.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Sin mensajes enviados todavía.</p>}
          {history.map(m => (
            <div key={m.id} className="p-3 border-b border-gray-50 last:border-0">
              <div className="flex justify-between items-start">
                <p className="text-sm font-medium" style={{ color: '#001B71' }}>{m.title}</p>
                <p className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString('es-GT')}</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">{m.body}</p>
              <p className="text-xs text-gray-400 mt-1">
                Para: {m.target_scope === 'user' ? (m.target_user_name || 'usuario') : m.target_scope === 'admins' ? 'administradores' : 'todos'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
