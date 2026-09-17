import { useState, useEffect } from 'react';
import api from '../../lib/api';

export default function AdminUsers() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [ous, setOUs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [filterOU, setFilterOU] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterAdmins, setFilterAdmins] = useState('');
  const [page, setPage] = useState(0);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const perPage = 50;

  useEffect(() => {
    api.get('/admin/org-units').then(r => setOUs(r.data.data || [])).catch(() => { });
    loadGroups();
  }, []);

  useEffect(() => { loadUsers(); }, [page, filterOU, filterStatus, filterAdmins, search]);

  function loadUsers() {
    const params = new URLSearchParams({ limit: perPage, offset: page * perPage });
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterOU) params.set('ou', filterOU);
    if (filterAdmins) params.set('admins', filterAdmins);
    api.get(`/admin/users?${params}`).then(r => { setUsers(r.data.data || []); setTotal(r.data.total || 0); }).catch(() => { });
  }

  function loadGroups() {
    api.get('/admin/groups').then(r => setGroups(r.data.data || [])).catch(() => { });
  }

  async function toggleAdmin(userId, makeAdmin) {
    try {
      await api.put(`/admin/users/${userId}/admin`, { isAdmin: makeAdmin });
      loadUsers();
    } catch { }
  }

  async function deactivateUser(userId) {
    if (!confirm('¿Inactivar este usuario? Ya no recibirá notificaciones ni se le asignarán capacitaciones.')) return;
    try {
      await api.put(`/admin/users/${userId}/deactivate`);
      loadUsers();
      if (selectedUser?.id === userId) setSelectedUser(prev => prev ? { ...prev, status: 'inactive' } : null);
    } catch { }
  }

  async function reactivateUser(userId) {
    try {
      await api.put(`/admin/users/${userId}/reactivate`);
      loadUsers();
      if (selectedUser?.id === userId) setSelectedUser(prev => prev ? { ...prev, status: 'active' } : null);
    } catch { }
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
      // Filter out users already in the group
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

  const tabs = [
    { id: 'users', label: `Usuarios (${total})` },
    { id: 'groups', label: `Grupos (${groups.length})` },
    { id: 'ad', label: 'Active Directory' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Usuarios</h1>

      <div className="flex gap-0 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-[#001B71] text-[#001B71]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ====== USERS TAB ====== */}
      {tab === 'users' && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar nombre o email..."
              className="border rounded-lg px-3 py-2 text-sm w-56" />
            <select value={filterOU} onChange={e => { setFilterOU(e.target.value); setPage(0); }} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Todas las OUs</option>
              {ous.map(ou => <option key={ou.id} value={ou.id}>{ou.name} ({ou.user_count || 0})</option>)}
            </select>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
            <select value={filterAdmins} onChange={e => { setFilterAdmins(e.target.value); setPage(0); }} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Todos los roles</option>
              <option value="only">Solo admins</option>
              <option value="exclude">No admins</option>
            </select>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: '#001B71' }} className="text-white">
                <tr>
                  <th className="text-left p-3">Usuario</th>
                  <th className="text-left p-3">OU / Depto</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-right p-3">Risk</th>
                  <th className="text-center p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedUser(u)}>
                    <td className="p-3">
                      <p className="font-medium" style={{ color: '#001B71' }}>{u.display_name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {u.org_unit_name || '—'}
                      {u.department && <span className="block text-gray-400">{u.department}</span>}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                      {u.is_admin === 1 && <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Admin</span>}
                    </td>
                    <td className="p-3 text-right font-bold text-xs" style={{ color: parseFloat(u.risk_score) > 20 ? '#e74c3c' : '#001B71' }}>
                      {u.risk_score || 0}
                    </td>
                    <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {u.is_admin !== 1 ? (
                          <button onClick={() => toggleAdmin(u.id, true)} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: '#2B5597' }}>+Admin</button>
                        ) : (
                          <button onClick={() => toggleAdmin(u.id, false)} className="text-xs px-2 py-1 rounded bg-orange-500 text-white">-Admin</button>
                        )}
                        {u.status === 'active' ? (
                          <button onClick={() => deactivateUser(u.id)}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">
                            Inactivar
                          </button>
                        ) : (
                          <button onClick={() => reactivateUser(u.id)}
                            className="text-xs px-2 py-1 rounded border border-green-200 text-green-600 hover:bg-green-50">
                            Activar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-gray-400">No se encontraron usuarios</td></tr>}
              </tbody>
            </table>
          </div>

          {total > perPage && (
            <div className="flex justify-center gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1 rounded text-sm border disabled:opacity-50">Anterior</button>
              <span className="px-3 py-1 text-sm text-gray-500">Página {page + 1} de {Math.ceil(total / perPage)}</span>
              <button onClick={() => setPage(page + 1)} disabled={(page + 1) * perPage >= total} className="px-3 py-1 rounded text-sm border disabled:opacity-50">Siguiente</button>
            </div>
          )}
        </>
      )}

      {/* ====== GROUPS TAB ====== */}
      {tab === 'groups' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowNewGroup(true)} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
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

            {/* Detalle del grupo seleccionado */}
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
        </div>
      )}

      {/* ====== AD TAB ====== */}
      {tab === 'ad' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h3 className="font-title font-bold" style={{ color: '#001B71' }}>Sincronización con Active Directory</h3>
          <p className="text-sm text-gray-600">
            Dominio: <code className="bg-gray-100 px-2 py-0.5 rounded">CORPORATIVOAGROAMERICA.CORP</code><br />
            El sync se ejecuta automáticamente cada hora.
          </p>
          <div className="flex gap-3">
            <button onClick={async () => {
              try {
                const { data } = await api.post('/admin/sync/ad?dryRun=true');
                alert(`Dry Run: ${data.stats?.users?.created || 0} nuevos, ${data.stats?.users?.deactivated || 0} desactivados, ${data.stats?.orgUnits?.created || 0} OUs nuevas`);
              } catch (err) { alert(err.response?.data?.error || 'Error'); }
            }} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50">
              Simular sync (dry run)
            </button>
            <button onClick={async () => {
              if (!confirm('¿Ejecutar sincronización real?')) return;
              try {
                const { data } = await api.post('/admin/sync/ad');
                alert(`Sync completado en ${data.duration_ms}ms:\n• ${data.stats?.users?.created || 0} creados\n• ${data.stats?.users?.deactivated || 0} desactivados`);
                loadUsers();
              } catch (err) { alert(err.response?.data?.error || 'Error'); }
            }} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
              Sincronizar ahora
            </button>
          </div>
          <p className="text-xs text-gray-400">OUs disponibles: {ous.length}</p>
        </div>
      )}

      {/* ====== MODAL: Detalle de usuario ====== */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Detalle del usuario</h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600 text-xl">{'\u2715'}</button>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                style={{ backgroundColor: '#00BC70', color: '#001B71' }}>
                {selectedUser.display_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: '#001B71' }}>{selectedUser.display_name}</p>
                <p className="text-sm text-gray-500">{selectedUser.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <InfoField label="Estado" value={selectedUser.status === 'active' ? 'Activo' : 'Inactivo'} />
              <InfoField label="Rol" value={selectedUser.is_admin === 1 ? 'Administrador' : 'Colaborador'} />
              <InfoField label="OU" value={selectedUser.org_unit_name || '—'} />
              <InfoField label="Departamento" value={selectedUser.department || '—'} />
              <InfoField label="Puesto" value={selectedUser.job_title || '—'} />
              <InfoField label="Risk Score" value={selectedUser.risk_score || '0'} highlight={parseFloat(selectedUser.risk_score) > 20} />
              <InfoField label="Phish Prone" value={selectedUser.phish_prone === 1 ? 'Sí' : 'No'} highlight={selectedUser.phish_prone === 1} />
              <InfoField label="Registrado" value={selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString('es-GT') : '—'} />
            </div>

            <div className="flex gap-2 pt-4 border-t border-gray-100">
              {selectedUser.is_admin !== 1 ? (
                <button onClick={() => { toggleAdmin(selectedUser.id, true); setSelectedUser({ ...selectedUser, is_admin: 1 }); }}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#2B5597' }}>
                  Promover a Admin
                </button>
              ) : (
                <button onClick={() => { toggleAdmin(selectedUser.id, false); setSelectedUser({ ...selectedUser, is_admin: 0 }); }}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-orange-500 text-white">
                  Quitar Admin
                </button>
              )}
              {selectedUser.status === 'active' ? (
                <button onClick={() => deactivateUser(selectedUser.id)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50">
                  Desactivar usuario
                </button>
              ) : (
                <button onClick={() => reactivateUser(selectedUser.id)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-green-600 border border-green-200 hover:bg-green-50">
                  Reactivar usuario
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== MODAL: Nuevo Grupo ====== */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowNewGroup(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Nuevo grupo personalizado</h3>
              <button onClick={() => setShowNewGroup(false)} className="text-gray-400 hover:text-gray-600 text-xl">{'\u2715'}</button>
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

      {/* ====== MODAL: Agregar miembros al grupo ====== */}
      {showAddMembers && selectedGroup && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddMembers(false); setMemberSearch(''); setMemberResults([]); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>
                Agregar miembros a: {selectedGroup.name}
              </h3>
              <button onClick={() => { setShowAddMembers(false); setMemberSearch(''); setMemberResults([]); }}
                className="text-gray-400 hover:text-gray-600 text-xl">{'\u2715'}</button>
            </div>

            <div className="mb-4">
              <input value={memberSearch} onChange={e => searchMembers(e.target.value)}
                placeholder="Buscar usuario por nombre o email..."
                className="w-full border rounded-lg px-3 py-2 text-sm"
                autoFocus />
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

function InfoField({ label, value, highlight = false }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-medium ${highlight ? 'text-red-600' : ''}`} style={!highlight ? { color: '#001B71' } : {}}>
        {value}
      </p>
    </div>
  );
}
