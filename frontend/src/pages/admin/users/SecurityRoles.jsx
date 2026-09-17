import { useState, useEffect } from 'react';
import api from '../../../lib/api';

const PERMISSION_LABELS = {
  users: 'Usuarios',
  phishing: 'Phishing',
  training: 'Capacitación',
  reports: 'Informes',
  settings: 'Configuración',
  physical_tests: 'Pruebas físicas',
};

export default function SecurityRoles() {
  const [catalog, setCatalog] = useState([]);
  const [roles, setRoles] = useState([]);
  const [showNewRole, setShowNewRole] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] });
  const [selectedRole, setSelectedRole] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);

  useEffect(() => {
    api.get('/admin/permissions/catalog').then(r => setCatalog(r.data.data || [])).catch(() => { });
    loadRoles();
  }, []);

  function loadRoles() {
    api.get('/admin/roles').then(r => setRoles(r.data.data || [])).catch(() => { });
  }

  async function createRole(e) {
    e.preventDefault();
    try {
      await api.post('/admin/roles', roleForm);
      setShowNewRole(false);
      setRoleForm({ name: '', description: '', permissions: [] });
      loadRoles();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function deleteRole(id) {
    if (!confirm('¿Eliminar este rol? Los usuarios asignados perderán los permisos que otorgaba.')) return;
    try {
      await api.delete(`/admin/roles/${id}`);
      if (selectedRole?.id === id) setSelectedRole(null);
      loadRoles();
    } catch { }
  }

  async function viewRole(role) {
    setSelectedRole(role);
    try {
      const { data } = await api.get(`/admin/roles/${role.id}/assignments`);
      setAssignments(data.data || []);
    } catch { }
  }

  async function searchUsers(q) {
    setUserSearch(q);
    if (q.length < 2) { setUserResults([]); return; }
    try {
      const { data } = await api.get(`/admin/users?search=${encodeURIComponent(q)}&limit=10&status=active`);
      const existingIds = new Set(assignments.map(a => a.id));
      setUserResults((data.data || []).filter(u => !existingIds.has(u.id)));
    } catch { }
  }

  async function assignUser(userId) {
    if (!selectedRole) return;
    try {
      await api.post(`/admin/roles/${selectedRole.id}/assign`, { user_id: userId });
      viewRole(selectedRole);
      loadRoles();
    } catch { }
  }

  async function unassignUser(userId) {
    if (!selectedRole) return;
    try {
      await api.delete(`/admin/roles/${selectedRole.id}/assign/${userId}`);
      viewRole(selectedRole);
      loadRoles();
    } catch { }
  }

  function togglePermission(perm) {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm) ? prev.permissions.filter(p => p !== perm) : [...prev.permissions, perm],
    }));
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        Los administradores (rol "Administrador" completo) siempre tienen acceso total. Estos roles personalizados otorgan
        acceso limitado a usuarios que no son administradores completos.
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowNewRole(true)} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
          + Nuevo rol
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          {roles.length === 0 && <p className="text-gray-400 text-center py-8">No hay roles personalizados.</p>}
          {roles.map(r => (
            <div key={r.id} onClick={() => viewRole(r)}
              className={`p-4 rounded-xl border cursor-pointer transition-colors ${selectedRole?.id === r.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium" style={{ color: '#001B71' }}>{r.name}</p>
                  <p className="text-xs text-gray-400">{r.assigned_count || 0} usuarios asignados</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(r.permissions || []).map(p => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{PERMISSION_LABELS[p] || p}</span>
                    ))}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteRole(r.id); }} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
              </div>
            </div>
          ))}
        </div>

        {selectedRole && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-bold mb-3" style={{ color: '#001B71' }}>Usuarios con rol: {selectedRole.name}</h3>
            <input value={userSearch} onChange={e => searchUsers(e.target.value)} placeholder="Buscar y agregar usuario..."
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            {userResults.length > 0 && (
              <div className="max-h-32 overflow-auto space-y-1 mb-3">
                {userResults.map(u => (
                  <button key={u.id} type="button" onClick={() => { assignUser(u.id); setUserSearch(''); setUserResults([]); }}
                    className="w-full text-left p-2 rounded-lg border border-gray-100 hover:bg-gray-50 text-sm">
                    {u.display_name} <span className="text-xs text-gray-400">({u.email})</span>
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-64 overflow-auto space-y-1">
              {assignments.map(a => (
                <div key={a.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium">{a.display_name}</p>
                    <p className="text-xs text-gray-400">{a.email}</p>
                  </div>
                  <button onClick={() => unassignUser(a.id)} className="text-xs text-red-400 hover:text-red-600">Quitar</button>
                </div>
              ))}
              {assignments.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Sin usuarios asignados a este rol.</p>}
            </div>
          </div>
        )}
      </div>

      {showNewRole && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowNewRole(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Nuevo rol personalizado</h3>
              <button onClick={() => setShowNewRole(false)} className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
            </div>
            <form onSubmit={createRole} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del rol</label>
                <input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" required placeholder="ej: Administrador de reportes" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <textarea value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm h-16" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Permisos</label>
                <div className="grid grid-cols-2 gap-2">
                  {catalog.map(p => (
                    <label key={p} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={roleForm.permissions.includes(p)} onChange={() => togglePermission(p)} className="w-4 h-4 rounded" />
                      {PERMISSION_LABELS[p] || p}
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Crear rol</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
