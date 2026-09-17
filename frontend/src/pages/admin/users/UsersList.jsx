import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [allGroups, setAllGroups] = useState([]);
  const [ous, setOUs] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterAdmins, setFilterAdmins] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [page, setPage] = useState(0);
  const [editUser, setEditUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const perPage = 50;

  useEffect(() => {
    api.get('/admin/groups/all').then(r => setAllGroups(r.data.data || [])).catch(() => { });
    api.get('/admin/org-units').then(r => setOUs(r.data.data || [])).catch(() => { });
  }, []);

  useEffect(() => { loadUsers(); }, [page, filterStatus, filterAdmins, filterGroup, search]);

  function loadUsers() {
    setLoading(true);
    const params = new URLSearchParams({ limit: perPage, offset: page * perPage });
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterAdmins) params.set('admins', filterAdmins);
    if (filterGroup) params.set('group', filterGroup);
    api.get(`/admin/users?${params}`)
      .then(r => { setUsers(r.data.data || []); setTotal(r.data.total || 0); })
      .catch(() => { })
      .finally(() => setLoading(false));
  }

  async function archiveUser(userId) {
    if (!confirm('¿Archivar este usuario? Ya no recibirá notificaciones ni se le asignarán capacitaciones.')) return;
    try {
      await api.put(`/admin/users/${userId}/deactivate`);
      loadUsers();
    } catch { }
  }

  async function unarchiveUser(userId) {
    try {
      await api.put(`/admin/users/${userId}/reactivate`);
      loadUsers();
    } catch { }
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await api.put(`/admin/users/${editUser.id}`, {
        display_name: editUser.display_name,
        first_name: editUser.first_name,
        last_name: editUser.last_name,
        email: editUser.email,
        department: editUser.department,
        job_title: editUser.job_title,
        org_unit_id: editUser.org_unit_id || null,
      });
      setEditUser(null);
      loadUsers();
    } catch (err) { alert(err.response?.data?.error || 'Error al guardar'); }
  }

  function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString('es-GT') : '—';
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar por correo o nombre..."
          className="border rounded-lg px-3 py-2 text-sm w-64" />

        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-500">Estado:</span>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm">
            <option value="active">Activos</option>
            <option value="inactive">Archivado</option>
            <option value="">Todos</option>
          </select>
        </div>

        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-500">Tipo:</span>
          <select value={filterAdmins} onChange={e => { setFilterAdmins(e.target.value); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="exclude">Usuario</option>
            <option value="only">Administrador</option>
          </select>
        </div>

        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-500">Grupos:</span>
          <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm max-w-[220px]">
            <option value="">Todos</option>
            {allGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.member_count || 0})</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: '#001B71' }} className="text-white">
            <tr>
              <th className="text-left p-3">Usuario</th>
              <th className="text-right p-3">PPP</th>
              <th className="text-right p-3">Riesgo</th>
              <th className="text-left p-3">Grupos</th>
              <th className="text-left p-3">Se unió el</th>
              <th className="text-left p-3">Último inicio de sesión</th>
              <th className="text-center p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const groupsLabel = [u.org_unit_name, u.custom_groups_csv].filter(Boolean).join(', ') || '—';
              return (
                <tr key={u.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="p-3">
                    <p className="font-medium" style={{ color: '#001B71' }}>{u.email}</p>
                    <p className="text-xs text-gray-400">{u.display_name}</p>
                    <div className="flex gap-1 mt-1">
                      {u.status !== 'active' && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500">Archivado</span>}
                      {u.is_admin === 1 && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-700">Admin</span>}
                    </div>
                  </td>
                  <td className="p-3 text-right font-medium">{u.ppp === null || u.ppp === undefined ? '—' : `${u.ppp}%`}</td>
                  <td className="p-3 text-right font-bold" style={{ color: parseFloat(u.risk_score) > 20 ? '#e74c3c' : '#001B71' }}>
                    {u.risk_score || 0}
                  </td>
                  <td className="p-3 text-xs text-gray-500 max-w-[220px] truncate" title={groupsLabel}>{groupsLabel}</td>
                  <td className="p-3 text-xs text-gray-500">{fmtDate(u.created_at)}</td>
                  <td className="p-3 text-xs text-gray-500">{fmtDate(u.last_login_at)}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setEditUser({ ...u })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
                        Editar
                      </button>
                      {u.status === 'active' ? (
                        <button onClick={() => archiveUser(u.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">
                          Archivar
                        </button>
                      ) : (
                        <button onClick={() => unarchiveUser(u.id)} className="text-xs px-2 py-1 rounded border border-green-200 text-green-600 hover:bg-green-50">
                          Desarchivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && users.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-gray-400">No se encontraron usuarios</td></tr>}
            {loading && <tr><td colSpan="7" className="p-8 text-center text-gray-400">Cargando...</td></tr>}
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

      {editUser && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Editar usuario</h3>
              <button onClick={() => setEditUser(null)} className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
            </div>
            <form onSubmit={saveEdit} className="space-y-3">
              <Field label="Nombre completo" value={editUser.display_name} onChange={v => setEditUser({ ...editUser, display_name: v })} required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre" value={editUser.first_name || ''} onChange={v => setEditUser({ ...editUser, first_name: v })} />
                <Field label="Apellido" value={editUser.last_name || ''} onChange={v => setEditUser({ ...editUser, last_name: v })} />
              </div>
              <Field label="Correo" type="email" value={editUser.email} onChange={v => setEditUser({ ...editUser, email: v })} required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Departamento" value={editUser.department || ''} onChange={v => setEditUser({ ...editUser, department: v })} />
                <Field label="Puesto" value={editUser.job_title || ''} onChange={v => setEditUser({ ...editUser, job_title: v })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">OU</label>
                <select value={editUser.org_unit_id || ''} onChange={e => setEditUser({ ...editUser, org_unit_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin OU</option>
                  {ous.map(ou => <option key={ou.id} value={ou.id}>{ou.name}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Guardar cambios</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, required, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm" required={required} />
    </div>
  );
}
