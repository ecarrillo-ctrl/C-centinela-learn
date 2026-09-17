import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState([]);

  useEffect(() => { loadGroups(); }, []);

  function loadGroups() {
    api.get('/admin/groups').then(r => setGroups(r.data.data || [])).catch(() => { });
  }

  async function createGroup(e) {
    e.preventDefault();
    try {
      await api.post('/admin/groups', groupForm);
      setShowNewGroup(false);
      setGroupForm({ name: '', description: '' });
      loadGroups();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function viewGroup(group) {
    setSelectedGroup(group);
    try {
      const { data } = await api.get(`/admin/groups/${group.id}/members`);
      setGroupMembers(data.data || []);
    } catch { }
  }

  async function removeFromGroup(userId) {
    if (!selectedGroup) return;
    try {
      await api.delete(`/admin/groups/${selectedGroup.id}/members/${userId}`);
      viewGroup(selectedGroup);
      loadGroups();
    } catch { }
  }

  async function deleteGroup(groupId) {
    if (!confirm('¿Eliminar este grupo?')) return;
    try {
      await api.delete(`/admin/groups/${groupId}`);
      setSelectedGroup(null);
      loadGroups();
    } catch { }
  }

  async function searchMembers(q) {
    setMemberSearch(q);
    if (q.length < 2) { setMemberResults([]); return; }
    try {
      const params = new URLSearchParams({ search: q, limit: 10, offset: 0, status: 'active' });
      const { data } = await api.get(`/admin/users?${params}`);
      const existingIds = new Set(groupMembers.map(m => m.id));
      setMemberResults((data.data || []).filter(u => !existingIds.has(u.id)));
    } catch { }
  }

  async function addMemberToGroup(userId) {
    if (!selectedGroup) return;
    try {
      await api.post(`/admin/groups/${selectedGroup.id}/members`, { user_ids: [userId] });
      setMemberResults(prev => prev.filter(u => u.id !== userId));
      viewGroup(selectedGroup);
      loadGroups();
    } catch { }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-400">Grupos personalizados para segmentar campañas, mensajes y reportes. Las OUs sincronizadas desde AD se administran en Aprovisionamiento.</p>
        <button onClick={() => setShowNewGroup(true)} className="px-4 py-2 rounded-lg text-white text-sm font-medium whitespace-nowrap" style={{ backgroundColor: '#001B71' }}>
          + Nuevo grupo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          {groups.length === 0 && <p className="text-gray-400 text-center py-8">No hay grupos personalizados.</p>}
          {groups.map(g => (
            <div key={g.id} onClick={() => viewGroup(g)}
              className={`p-4 rounded-xl border cursor-pointer transition-colors ${selectedGroup?.id === g.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium" style={{ color: '#001B71' }}>{g.name}</p>
                  <p className="text-xs text-gray-400">{g.member_count || 0} miembros</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
              </div>
            </div>
          ))}
        </div>

        {selectedGroup && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold" style={{ color: '#001B71' }}>{selectedGroup.name}</h3>
              <button onClick={() => setShowAddMembers(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#00BC70' }}>
                + Agregar miembros
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">{groupMembers.length} miembros</p>
            <div className="max-h-64 overflow-auto space-y-1">
              {groupMembers.map(m => (
                <div key={m.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium">{m.display_name}</p>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </div>
                  <button onClick={() => removeFromGroup(m.id)} className="text-xs text-red-400 hover:text-red-600">Quitar</button>
                </div>
              ))}
              {groupMembers.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Sin miembros. Use el botón "Agregar miembros".</p>}
            </div>
          </div>
        )}
      </div>

      {showNewGroup && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowNewGroup(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Nuevo grupo personalizado</h3>
              <button onClick={() => setShowNewGroup(false)} className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
            </div>
            <form onSubmit={createGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del grupo</label>
                <input value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" required placeholder="ej: Equipo de TI Guatemala" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <textarea value={groupForm.description} onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm h-16" />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Crear grupo</button>
            </form>
          </div>
        </div>
      )}

      {showAddMembers && selectedGroup && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddMembers(false); setMemberSearch(''); setMemberResults([]); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>
                Agregar miembros a: {selectedGroup.name}
              </h3>
              <button onClick={() => { setShowAddMembers(false); setMemberSearch(''); setMemberResults([]); }}
                className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
            </div>
            <div className="mb-4">
              <input value={memberSearch} onChange={e => searchMembers(e.target.value)}
                placeholder="Buscar usuario por nombre o email..."
                className="w-full border rounded-lg px-3 py-2 text-sm" autoFocus />
              <p className="text-xs text-gray-400 mt-1">Escriba al menos 2 caracteres para buscar</p>
            </div>
            <div className="max-h-64 overflow-auto space-y-1">
              {memberResults.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#001B71' }}>{u.display_name}</p>
                    <p className="text-xs text-gray-400">{u.email} · {u.org_unit_name || '—'}</p>
                  </div>
                  <button onClick={() => addMemberToGroup(u.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#00BC70' }}>
                    Agregar
                  </button>
                </div>
              ))}
              {memberSearch.length >= 2 && memberResults.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No se encontraron usuarios</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
