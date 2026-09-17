import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../../lib/api';

const COLORS = ['#001B71', '#00BC70', '#2B5597', '#e74c3c', '#f39c12', '#9b59b6'];

export default function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [risk, setRisk] = useState([]);
  const [phishProne, setPhishProne] = useState({ campaigns: [], current: {} });
  const [trainingProgress, setTrainingProgress] = useState({ by_ou: [], summary: {} });
  const [topClickers, setTopClickers] = useState([]);
  const [heatmap, setHeatmap] = useState({});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [r, pp, tp, tc, hm] = await Promise.all([
        api.get('/admin/analytics/risk?scope=ou'),
        api.get('/admin/analytics/phish-prone'),
        api.get('/admin/analytics/training-progress'),
        api.get('/admin/analytics/top-clickers?limit=10'),
        api.get('/admin/analytics/heatmap'),
      ]);
      setRisk(r.data.data || []);
      setPhishProne(pp.data || { campaigns: [], current: {} });
      setTrainingProgress(tp.data || { by_ou: [], summary: {} });
      setTopClickers(tc.data.data || []);
      setHeatmap(hm.data.data || {});
    } catch { }
    setLoading(false);
  }

  async function downloadPdf() {
    try {
      const response = await api.get('/admin/analytics/report', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `RPT-LEARN-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { alert('Error generando PDF'); }
  }

  async function refreshViews() {
    try {
      await api.post('/admin/analytics/refresh-views');
      alert('Vistas actualizadas');
      loadAll();
    } catch { alert('Error refrescando vistas'); }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando reportes...</div>;

  const summary = trainingProgress.summary || {};
  const currentProne = phishProne.current || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Informes</h1>
        <div className="flex gap-2">
          <button onClick={refreshViews} className="px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
            Actualizar datos
          </button>
          <button onClick={downloadPdf} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
            Exportar PDF
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Phish Prone %" value={`${currentProne.CURRENT_PCT || currentProne.current_pct || 0}%`} color="#e74c3c" subtitle={`${currentProne.PRONE_COUNT || currentProne.prone_count || 0} usuarios`} />
        <KPI label="Capacitación completada" value={`${summary.OVERALL_PCT || summary.overall_pct || 0}%`} color="#00BC70" subtitle={`${summary.COMPLETED || summary.completed || 0} completados`} />
        <KPI label="En progreso" value={summary.IN_PROGRESS || summary.in_progress || 0} color="#2B5597" subtitle="capacitaciones activas" />
        <KPI label="Top clickers" value={topClickers.length} color="#f39c12" subtitle="usuarios reincidentes" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Phish Prone trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-title text-sm font-bold mb-4" style={{ color: '#001B71' }}>Tendencia Phish Prone (click rate por campaña)</h3>
          {phishProne.campaigns.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={phishProne.campaigns}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip />
                <Line type="monotone" dataKey="click_rate" stroke="#e74c3c" strokeWidth={2} dot={{ r: 4 }} name="Click Rate %" />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos de campañas</p>}
        </div>

        {/* Training progress pie */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-title text-sm font-bold mb-4" style={{ color: '#001B71' }}>Estado de capacitación</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Completado', value: parseInt(summary.COMPLETED || summary.completed || 0) },
                  { name: 'En progreso', value: parseInt(summary.IN_PROGRESS || summary.in_progress || 0) },
                  { name: 'Asignado', value: parseInt(summary.ASSIGNED || summary.assigned || 0) },
                ]}
                cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                <Cell fill="#00BC70" /><Cell fill="#2B5597" /><Cell fill="#D1CCBD" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Risk by OU */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-title text-sm font-bold mb-4" style={{ color: '#001B71' }}>Riesgo promedio por unidad organizacional</h3>
        {risk.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={risk.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={r => r.ORG_UNIT_NAME || r.org_unit_name || '—'} tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey={r => parseFloat(r.AVG_RISK_SCORE || r.avg_risk_score || 0)} fill="#001B71" radius={[4, 4, 0, 0]} name="Risk Score">
                {risk.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos de riesgo</p>}
      </div>

      {/* Top Clickers table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-title text-sm font-bold mb-4" style={{ color: '#001B71' }}>Top 10 usuarios de mayor riesgo (clickers)</h3>
        {topClickers.length > 0 ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-400 border-b">
              <th className="pb-2">#</th><th className="pb-2">Usuario</th><th className="pb-2">OU</th><th className="pb-2">Score</th><th className="pb-2">Clicks</th><th className="pb-2">Aperturas</th><th className="pb-2">Reportes</th>
            </tr></thead>
            <tbody>
              {topClickers.map((u, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2 text-gray-400">{i + 1}</td>
                  <td className="py-2">
                    <p className="font-medium">{u.DISPLAY_NAME || u.display_name}</p>
                    <p className="text-xs text-gray-400">{u.EMAIL || u.email}</p>
                  </td>
                  <td className="py-2 text-gray-500 text-xs">{u.ORG_UNIT_NAME || u.org_unit_name || '—'}</td>
                  <td className="py-2"><span className={`font-bold ${parseFloat(u.RISK_SCORE || u.risk_score) > 30 ? 'text-red-600' : 'text-amber-600'}`}>{u.RISK_SCORE || u.risk_score}</span></td>
                  <td className="py-2 text-red-600 font-medium">{u.TOTAL_CLICKS || u.total_clicks}</td>
                  <td className="py-2 text-gray-500">{u.TOTAL_OPENS || u.total_opens}</td>
                  <td className="py-2 text-green-600">{u.TOTAL_REPORTS || u.total_reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-gray-400 text-sm text-center py-4">Sin datos de clickers</p>}
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-title text-sm font-bold mb-4" style={{ color: '#001B71' }}>Mapa de calor: click rate por OU y tipo de amenaza</h3>
        {Object.keys(heatmap).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-gray-400 border-b">
                <th className="pb-2 pr-4">OU</th>
                {[...new Set(Object.values(heatmap).flatMap(v => Object.keys(v)))].map(t => (
                  <th key={t} className="pb-2 px-2 text-center">{t}</th>
                ))}
              </tr></thead>
              <tbody>
                {Object.entries(heatmap).map(([ou, threats]) => (
                  <tr key={ou} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium">{ou}</td>
                    {[...new Set(Object.values(heatmap).flatMap(v => Object.keys(v)))].map(t => {
                      const val = threats[t]?.click_rate || 0;
                      const bg = val > 30 ? '#fee2e2' : val > 15 ? '#fef3c7' : val > 0 ? '#d1fae5' : '#f9fafb';
                      const color = val > 30 ? '#991b1b' : val > 15 ? '#92400e' : val > 0 ? '#065f46' : '#9ca3af';
                      return (
                        <td key={t} className="py-2 px-2 text-center rounded" style={{ backgroundColor: bg, color }}>
                          {val > 0 ? `${val}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-gray-400 text-sm text-center py-4">Sin datos de heatmap</p>}
      </div>
    </div>
  );
}

function KPI({ label, value, color, subtitle }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs font-medium text-gray-700 mt-1">{label}</p>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}
