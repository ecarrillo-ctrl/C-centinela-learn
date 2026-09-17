import { useState, useEffect } from 'react';
import api from '../lib/api';

/**
 * Componente para seleccionar destinatarios de una campaña.
 * 3 módulos: Usuarios individuales, OUs/Grupos AD, Grupos personalizados.
 */
export default function TargetSelector({ value, onChange, onClose }) {
  const [tab, setTab] = useState('ous');
  const [ous, setOUs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [ouFilter, setOuFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedUsers, setSelectedUsers] = useState(value?.user_ids || []);
  const [selectedUserNames, setSelectedUserNames] = useState([]);
  const [selectedOUs, setSelectedOUs] = useState(value?.ou_ids || []);
  const [selectedGroups, setSelectedGroups] = useState(value?.group_ids || []);

  useEffect(() => {
    Promise.all([
      api.get('/admin/org-units').catch(() => ({ data: { data: [] } })),
      api.get('/admin/groups').catch(() => ({ data: { data: [] } })),
    ]).then(([ouRes, groupRes]) => {
      setOUs(ouRes.data.data || []);
      setGroups(groupRes.data.data || []);
      setLoading(false);
    });
  }, []);

  async function searchUsers(q) {
    setUserSearch(q);
    if (q.length < 2) { setUserResults([]); return; }
    try {
      const { data } = await api.get(`/admin/users?search=${encodeURIComponent(q)}&limit=20&status=active`);
      setUserResults(data.data || []);
    } catch { setUserResults([]); }
  }

  function toggleUser(user) {
    const id = user.id;
    if (selectedUsers.includes(id)) {
      setSelectedUsers(prev => prev.filter(x => x !== id));
      setSelectedUserNames(prev => prev.filter(x => x.id !== id));
    } else {
      setSelectedUsers(prev => [...prev, id]);
      setSelectedUserNames(prev => [...prev, { id, name: user.display_name, email: user.email }]);
    }
  }

  function toggleOU(ouId) {
    setSelectedOUs(prev => prev.includes(ouId) ? prev.filter(x => x !== ouId) : [...prev, ouId]);
  }

  function toggleGroup(groupId) {
    setSelectedGroups(prev => prev.includes(groupId) ? prev.filter(x => x !== groupId) : [...prev, groupId]);
  }

  function handleConfirm(e) {
    // Prevent form submission from parent
    if (e) { e.preventDefault(); e.stopPropagation(); }
    onChange({ user_ids: selectedUsers, ou_ids: selectedOUs, group_ids: selectedGroups });
    if (onClose) onClose();
  }

  const totalSelected = selectedUsers.length + selectedOUs.length + selectedGroups.length;
  const ouUserCount = ous.filter(o => selectedOUs.includes(o.id)).reduce((s, o) => s + parseInt(o.user_count || 0), 0);
  const groupUserCount = groups.filter(g => selectedGroups.includes(g.id)).reduce((s, g) => s + parseInt(g.member_count || 0), 0);

  // Filtered lists
  const filteredOUs = ous.filter(ou => {
    if (!ouFilter) return true;
    const q = ouFilter.toLowerCase();
    return (ou.name || '').toLowerCase().includes(q) || (ou.organization_name || '').toLowerCase().includes(q);
  });

  const filteredGroups = groups.filter(g => {
    if (!groupFilter) return true;
    return (g.name || '').toLowerCase().includes(groupFilter.toLowerCase());
  });

  if (loading) return <div className="py-8 text-center text-gray-400">Cargando...</div>;

  const tabs = [
    { id: 'ous', label: `OUs (${selectedOUs.length})`, icon: '\u{1F3E2}' },
    { id: 'groups', label: `Grupos (${selectedGroups.length})`, icon: '\u{1F465}' },
    { id: 'users', label: `Usuarios (${selectedUsers.length})`, icon: '\u{1F464}' },
  ];

  return (
    <div className="space-y-3 border border-blue-200 rounded-lg p-3 bg-blue-50/30">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">
          {totalSelected === 0 ? 'Sin selección = toda la organización' : (
            <span>
              {selectedUsers.length > 0 && <span className="font-medium">{selectedUsers.length} usuarios</span>}
              {selectedUsers.length > 0 && (selectedOUs.length > 0 || selectedGroups.length > 0) && ' + '}
              {selectedOUs.length > 0 && <span className="font-medium">{selectedOUs.length} OUs (~{ouUserCount})</span>}
              {selectedOUs.length > 0 && selectedGroups.length > 0 && ' + '}
              {selectedGroups.length > 0 && <span className="font-medium">{selectedGroups.length} grupos (~{groupUserCount})</span>}
            </span>
          )}
        </p>
        <button type="button" onClick={handleConfirm}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#00BC70' }}>
          {'\u2713'} Confirmar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {tabs.map(t => (
          <button type="button" key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1 ${tab === t.id ? 'border-[#001B71] text-[#001B71]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* OUs tab */}
      {tab === 'ous' && (
        <div>
          <input value={ouFilter} onChange={e => setOuFilter(e.target.value)}
            placeholder="Filtrar OUs..." className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" />
          <div className="max-h-52 overflow-auto space-y-1">
            {filteredOUs.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No se encontraron OUs</p>}
            {filteredOUs.map(ou => {
              const checked = selectedOUs.includes(ou.id);
              return (
                <label key={ou.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-sm ${checked ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                  }`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleOU(ou.id)} className="w-4 h-4 rounded" />
                  <span className="flex-1">
                    <span className="font-medium" style={{ color: '#001B71' }}>{ou.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{ou.organization_name || ''} ({ou.user_count || 0})</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Groups tab */}
      {tab === 'groups' && (
        <div>
          <input value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
            placeholder="Filtrar grupos..." className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" />
          <div className="max-h-52 overflow-auto space-y-1">
            {filteredGroups.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">
                {groups.length === 0 ? 'No hay grupos. Créelos en Usuarios \u2192 Grupos.' : 'Sin resultados'}
              </p>
            )}
            {filteredGroups.map(g => {
              const checked = selectedGroups.includes(g.id);
              return (
                <label key={g.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-sm ${checked ? 'border-green-300 bg-green-50' : 'border-gray-100 hover:bg-gray-50'
                  }`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleGroup(g.id)} className="w-4 h-4 rounded" />
                  <span className="flex-1">
                    <span className="font-medium" style={{ color: '#001B71' }}>{g.name}</span>
                    <span className="text-xs text-gray-400 ml-2">({g.member_count || 0} miembros)</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div>
          <input value={userSearch} onChange={e => searchUsers(e.target.value)}
            placeholder="Buscar usuario por nombre o email..."
            className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" />

          {selectedUserNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedUserNames.map(u => (
                <span key={u.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                  {u.name}
                  <button type="button" onClick={() => toggleUser({ id: u.id, display_name: u.name, email: u.email })}
                    className="text-blue-500 hover:text-blue-800 font-bold">{'\u00D7'}</button>
                </span>
              ))}
            </div>
          )}

          <div className="max-h-44 overflow-auto space-y-1">
            {userResults.map(u => {
              const checked = selectedUsers.includes(u.id);
              return (
                <label key={u.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-sm ${checked ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                  }`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleUser(u)} className="w-4 h-4 rounded" />
                  <span>
                    <span className="font-medium">{u.display_name}</span>
                    <span className="text-xs text-gray-400 ml-1">({u.email})</span>
                  </span>
                </label>
              );
            })}
            {userSearch.length >= 2 && userResults.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">No se encontraron usuarios</p>
            )}
            {userSearch.length < 2 && selectedUsers.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">Escriba al menos 2 caracteres para buscar</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
