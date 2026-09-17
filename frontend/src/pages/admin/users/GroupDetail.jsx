import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import api from '../../../lib/api';
import UserTable from './UserTable';

const AD_DOMAIN = 'CORPORATIVOAGROAMERICA.CORP';

const LEVEL_INFO = {
  bajo: { label: 'Bajo', color: '#00BC70' },
  medio: { label: 'Medio', color: '#f39c12' },
  alto: { label: 'Alto', color: '#e74c3c' },
};

export default function GroupDetail() {
  const { type, rawId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showExplained, setShowExplained] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { loadDetail(); }, [type, rawId]);

  function loadDetail() {
    setLoading(true);
    api.get(`/admin/groups/${type}/${rawId}/detail`)
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }

  async function searchMembers(q) {
    setMemberSearch(q);
    if (q.length < 2) { setMemberResults([]); return; }
    try {
      const params = new URLSearchParams({ search: q, limit: 10, offset: 0, status: 'active' });
      const { data } = await api.get(`/admin/users?${params}`);
      setMemberResults(data.data || []);
    } catch { }
  }

  async function addMember(userId) {
    try {
      await api.post(`/admin/groups/${rawId}/members`, { user_ids: [userId] });
      setMemberResults(prev => prev.filter(u => u.id !== userId));
      loadDetail();
      setRefreshKey(k => k + 1);
    } catch { }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;
  if (!detail) return <div className="text-center py-12 text-gray-400">No se encontró el grupo.</div>;

  const level = LEVEL_INFO[detail.level] || LEVEL_INFO.bajo;
  const segments = detail.level === 'bajo' ? 1 : detail.level === 'medio' ? 2 : 4;
  const chartData = detail.sources
    .filter(s => s.event_count > 0)
    .map(s => ({ ...s, fill: s.total_delta > 0 ? '#e74c3c' : s.total_delta < 0 ? '#00BC70' : '#94a3b8' }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>
          {type === 'ou' ? `${AD_DOMAIN}\\${detail.name}` : detail.name}
        </h1>
        <Link to="/admin/users/groups" className="text-sm" style={{ color: '#2B5597' }}>{'←'} Regresar a Grupos</Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-title font-bold mb-4" style={{ color: '#001B71' }}>Puntaje de riesgo del grupo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <p className="text-3xl font-bold" style={{ color: level.color }}>{level.label}</p>
            <p className="text-sm text-gray-600 mt-1">Puntaje de riesgo: <strong>{detail.avg_risk_score}</strong></p>
            <div className="flex gap-1 mt-3 max-w-xs">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-2.5 flex-1 rounded-full" style={{ backgroundColor: i < segments ? level.color : '#e5e7eb' }} />
              ))}
            </div>
            <button onClick={() => setShowExplained(v => !v)} className="text-xs mt-3 flex items-center gap-1" style={{ color: '#2B5597' }}>
              {'ⓘ'} Su puntaje de riesgo explicado
            </button>
            {showExplained && (
              <p className="text-xs text-gray-500 mt-2 max-w-sm">
                Promedio del puntaje de riesgo (0-100) de los {detail.member_count} miembros activos del grupo. Cada usuario
                sube de puntaje al caer en phishing simulado y baja al completar capacitaciones o reportar correos
                sospechosos con el PAB; los eventos antiguos pierden peso con el tiempo (vida media de 90 días).
              </p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Aportes al riesgo (últimos 90 días)</h3>
            {chartData.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">Sin eventos de riesgo registrados en este periodo.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [v, 'Suma de cambios']} />
                  <Bar dataKey="total_delta" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-[11px] text-gray-400 mt-1">Rojo = subió el riesgo · Verde = lo bajó</p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-title text-xl font-bold" style={{ color: '#001B71' }}>Usuarios</h2>
          {type === 'custom' && (
            <button onClick={() => setShowAddMembers(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#00BC70' }}>
              + Agregar miembros
            </button>
          )}
        </div>
        <UserTable key={refreshKey} fixedGroup={`${type}:${rawId}`} showGroupFilter={false} />
      </div>

      {showAddMembers && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddMembers(false); setMemberSearch(''); setMemberResults([]); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Agregar miembros a: {detail.name}</h3>
              <button onClick={() => { setShowAddMembers(false); setMemberSearch(''); setMemberResults([]); }}
                className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
            </div>
            <input value={memberSearch} onChange={e => searchMembers(e.target.value)} placeholder="Buscar usuario por nombre o email..."
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3" autoFocus />
            <div className="max-h-64 overflow-auto space-y-1">
              {memberResults.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#001B71' }}>{u.display_name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                  <button onClick={() => addMember(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#00BC70' }}>
                    Agregar
                  </button>
                </div>
              ))}
              {memberSearch.length >= 2 && memberResults.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No se encontraron usuarios</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
