import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../lib/api';

const AD_DOMAIN = 'CORPORATIVOAGROAMERICA.CORP';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterType, setFilterType] = useState('custom');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState(new Set());
  const [openMenu, setOpenMenu] = useState(null);

  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [editingGroup, setEditingGroup] = useState(null);

  useEffect(() => { loadGroups(); }, [filterStatus, filterType]);

  function loadGroups() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterType) params.set('type', filterType);
    api.get(`/admin/groups/all?${params}`)
      .then(r => setGroups(r.data.data || []))
      .catch(() => { })
      .finally(() => setLoading(false));
  }

  const filtered = useMemo(() => {
    let list = groups;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(g => g.name.toLowerCase().includes(q));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === 'created_at') return (new Date(a.created_at) - new Date(b.created_at)) * dir;
      if (sortBy === 'member_count') return ((a.member_count || 0) - (b.member_count || 0)) * dir;
      return String(a.name).localeCompare(String(b.name)) * dir;
    });
  }, [groups, search, sortBy, sortDir]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(prev => (prev.size === filtered.length ? new Set() : new Set(filtered.map(g => g.id))));
  }

  async function bulkArchive() {
    if (selected.size === 0) return;
    if (!confirm(`¿Archivar ${selected.size} grupo(s)?`)) return;
    try {
      await api.post('/admin/groups/set-archived', { ids: [...selected], archived: true });
      setSelected(new Set());
      loadGroups();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function toggleArchiveOne(group) {
    try {
      await api.post('/admin/groups/set-archived', { ids: [group.id], archived: !group.is_archived });
      setOpenMenu(null);
      loadGroups();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function cloneGroup(group) {
    try {
      await api.post('/admin/groups/clone', { id: group.id });
      setOpenMenu(null);
      loadGroups();
    } catch (err) { alert(err.response?.data?.error || 'Error al clonar'); }
  }

  async function removeAllMembers(group) {
    if (!confirm(`¿Quitar a todos los miembros de "${group.name}"? El grupo quedará vacío.`)) return;
    try {
      await api.delete(`/admin/groups/${group.raw_id}/all-members`);
      setOpenMenu(null);
      loadGroups();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function archiveAllMembers(group) {
    if (!confirm(`¿Archivar a los ${group.member_count || 0} miembros de "${group.name}"? Dejarán de recibir notificaciones y capacitaciones.`)) return;
    try {
      const { data } = await api.post('/admin/groups/archive-members', { id: group.id });
      setOpenMenu(null);
      alert(`${data.archived} usuarios archivados`);
      loadGroups();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  function downloadCSV() {
    const header = ['Nombre', 'Tipo', 'Creado el', 'Puntaje de riesgo', 'Miembros', 'Estado'];
    const lines = filtered.map(g => [
      g.type === 'ou' ? `${AD_DOMAIN}\\${g.name}` : g.name,
      g.type === 'ou' ? 'OU (Active Directory)' : 'Grupo personalizado',
      g.created_at ? new Date(g.created_at).toLocaleDateString('es-GT') : '',
      g.avg_risk_score ?? '',
      g.member_count ?? 0,
      g.is_archived ? 'Archivado' : 'Activo',
    ]);
    const csv = [header, ...lines].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'grupos.csv'; a.click();
    URL.revokeObjectURL(url);
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

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await api.put(`/admin/groups/${editingGroup.raw_id}`, { name: editingGroup.name, description: editingGroup.description });
      setEditingGroup(null);
      loadGroups();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  const SortHeader = ({ col, label, align = 'left' }) => (
    <th className={`p-3 text-${align} cursor-pointer select-none`} onClick={() => toggleSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label} {sortBy === col && <span className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500 font-medium">Estado:</span>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="active">Activos</option>
              <option value="archived">Archivado</option>
              <option value="">Todos</option>
            </select>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500 font-medium">Tipo:</span>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              <option value="ou">OU (Active Directory)</option>
              <option value="custom">Grupo personalizado</option>
            </select>
          </div>
          <button onClick={() => setShowNewGroup(true)} className="px-3 py-1.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
            + Nuevo grupo
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={downloadCSV} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-green-200 text-green-700 hover:bg-green-50 flex items-center gap-1">
            {'⬇'} Descargar CSV
          </button>
          {selected.size > 0 && (
            <button onClick={bulkArchive} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-red-400 hover:bg-red-500 flex items-center gap-1">
              {'\u{1F5C4}'} Archivar ({selected.size})
            </button>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre de grupo..."
            className="border rounded-lg px-3 py-1.5 text-sm w-56" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: '#001B71' }} className="text-white">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll} className="w-4 h-4 rounded" />
              </th>
              <SortHeader col="name" label="Nombre" />
              <SortHeader col="created_at" label="Creado el" />
              <th className="p-3 text-left">Puntaje de riesgo</th>
              <SortHeader col="member_count" label="Miembros" />
              <th className="p-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(g => (
              <tr key={g.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="p-3"><input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)} className="w-4 h-4 rounded" /></td>
                <td className="p-3">
                  <Link to={`/admin/users/groups/${g.type}/${g.raw_id}`} className="text-left hover:underline flex items-center gap-1.5" style={{ color: '#2B5597' }}>
                    <span className="text-xs">{g.type === 'ou' ? '\u{1F5A5}️' : '\u{1F4CB}'}</span>
                    <span>{g.type === 'ou' ? `${AD_DOMAIN}\\${g.name}` : g.name}</span>
                  </Link>
                  {g.is_archived === 1 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Archivado</span>}
                </td>
                <td className="p-3 text-xs text-gray-500">{g.created_at ? new Date(g.created_at).toLocaleDateString('es-GT') : '—'}</td>
                <td className="p-3 font-medium" style={{ color: parseFloat(g.avg_risk_score) > 20 ? '#e74c3c' : '#001B71' }}>
                  {g.avg_risk_score ?? '—'}
                </td>
                <td className="p-3">{g.member_count ?? 0}</td>
                <td className="p-3 text-center relative">
                  <button onClick={() => setOpenMenu(openMenu === g.id ? null : g.id)} className="px-2 py-1 rounded hover:bg-gray-100 text-gray-500">
                    {'⋮'}
                  </button>
                  {openMenu === g.id && (
                    <div className="absolute right-2 top-9 z-20 bg-white rounded-lg shadow-xl border border-gray-100 py-1 min-w-[200px] text-left" onMouseLeave={() => setOpenMenu(null)}>
                      <button onClick={() => cloneGroup(g)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Clonar</button>
                      {g.type === 'custom' && (
                        <button onClick={() => { setEditingGroup({ raw_id: g.raw_id, name: g.name, description: '' }); setOpenMenu(null); }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Editar</button>
                      )}
                      <button onClick={() => toggleArchiveOne(g)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        {g.is_archived ? 'Desarchivar' : 'Archivar'}
                      </button>
                      {g.type === 'custom' && (
                        <button onClick={() => removeAllMembers(g)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Quitar todos los usuarios</button>
                      )}
                      <button onClick={() => archiveAllMembers(g)} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50">Archivar todos los usuarios</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-gray-400">No se encontraron grupos</td></tr>}
            {loading && <tr><td colSpan="6" className="p-8 text-center text-gray-400">Cargando...</td></tr>}
          </tbody>
        </table>
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

      {editingGroup && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setEditingGroup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Editar grupo</h3>
              <button onClick={() => setEditingGroup(null)} className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
            </div>
            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del grupo</label>
                <input value={editingGroup.name} onChange={e => setEditingGroup({ ...editingGroup, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" required />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Guardar cambios</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
