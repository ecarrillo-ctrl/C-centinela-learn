import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#00BC70', '#2B5597', '#001B71', '#D1CCBD', '#e74c3c', '#f39c12'];

export default function AdminDashboard() {
  const [risk, setRisk] = useState([]);
  const [phish, setPhish] = useState(null);
  const [progress, setProgress] = useState(null);
  const [topClickers, setTopClickers] = useState([]);
  const [heatmap, setHeatmap] = useState(null);

  useEffect(() => {
    api.get('/admin/analytics/risk?scope=ou').then(r => setRisk(r.data.data || [])).catch(() => {});
    api.get('/admin/analytics/phish-prone').then(r => setPhish(r.data)).catch(() => {});
    api.get('/admin/analytics/training-progress').then(r => setProgress(r.data)).catch(() => {});
    api.get('/admin/analytics/top-clickers?limit=5').then(r => setTopClickers(r.data.data || [])).catch(() => {});
    api.get('/admin/analytics/heatmap').then(r => setHeatmap(r.data.data || {})).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Dashboard Ejecutivo</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Risk Score por OU">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={risk}><CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="org_unit_name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="avg_risk_score" fill="#001B71" name="Score promedio" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Phish-Prone % — Serie temporal">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={phish?.campaigns || []}><CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="click_rate" stroke="#00BC70" name="Click rate %" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={`Top Clickers (${topClickers.length})`}>
          <div className="space-y-2">
            {topClickers.map((u, i) => (
              <div key={u.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <span className="text-sm">{i + 1}. {u.display_name} <span className="text-xs text-gray-400">({u.org_unit_name})</span></span>
                <span className="text-sm font-bold" style={{ color: '#e74c3c' }}>{u.total_clicks} clicks &middot; {u.risk_score}</span>
              </div>
            ))}
            {topClickers.length === 0 && <p className="text-gray-400 text-sm">Sin datos</p>}
          </div>
        </ChartCard>

        <ChartCard title="Progreso de capacitacion">
          {progress?.summary && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Completado: {progress.summary.completed}</span>
                <span>En progreso: {progress.summary.in_progress}</span>
                <span>Pendiente: {progress.summary.assigned}</span>
              </div>
              <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden flex">
                <div style={{ width: `${progress.summary.overall_pct}%`, backgroundColor: '#00BC70' }} className="h-full" />
                <div className="flex-1 h-full bg-gray-200" />
              </div>
              <p className="text-xs text-gray-400">{progress.summary.overall_pct}% completado</p>
            </div>
          )}
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={[
                  { name: 'Completado', value: parseInt(progress?.summary?.completed || 0) },
                  { name: 'En progreso', value: parseInt(progress?.summary?.in_progress || 0) },
                  { name: 'Asignado', value: parseInt(progress?.summary?.assigned || 0) },
                ]} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {[0, 1, 2].map(i => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>{title}</h2>
      {children}
    </div>
  );
}
