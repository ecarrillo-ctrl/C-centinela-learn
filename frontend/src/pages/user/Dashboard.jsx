import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function UserDashboard() {
  const { user } = useAuth();
  const [paths, setPaths] = useState([]);
  const [badges, setBadges] = useState([]);
  const [pab, setPab] = useState(0);

  useEffect(() => {
    api.get('/library/learning-paths').then(r => setPaths(r.data.data || [])).catch(() => { });
    api.get('/library/badges').then(r => setBadges((r.data.data || []).filter(b => b.earned))).catch(() => { });
    api.get('/pab/my-stats').then(r => setPab(r.data.total_pab_reports || 0)).catch(() => { });
  }, []);

  const completedPaths = paths.filter(p => p.all_completed).length;
  const totalPaths = paths.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>
          Bienvenido{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
        </h1>
        {totalPaths > 0 && completedPaths === totalPaths && (
          <span className="text-2xl">{'\u{1F389}'}</span>
        )}
      </div>

      {completedPaths === totalPaths && totalPaths > 0 && (
        <div className="rounded-xl p-4 text-white text-center font-medium" style={{ backgroundColor: '#00BC70' }}>
          {'\u{1F389}'} Ha completado toda la capacitacion obligatoria. {'\u{1F389}'}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Rutas completadas" value={`${completedPaths}/${totalPaths}`} color="#00BC70" />
        <StatCard label="Insignias ganadas" value={badges.length} color="#2B5597" />
        <StatCard label="Reportes PAB enviados" value={pab} color="#001B71" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>Rutas de aprendizaje</h2>
        {paths.length === 0 ? (
          <p className="text-gray-400">No hay rutas asignadas.</p>
        ) : (
          <div className="space-y-3">
            {paths.map(p => {
              const done = p.courses?.filter(c => c.enrollment_status === 'completed').length || 0;
              const total = p.courses?.length || 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <Link key={p.id} to="/training" className="block p-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm" style={{ color: '#001B71' }}>{p.name}</span>
                    <span className="text-xs font-medium" style={{ color: p.all_completed ? '#00BC70' : '#2B5597' }}>
                      {p.all_completed ? 'Completado' : `${pct}%`}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: p.all_completed ? '#00BC70' : '#2B5597' }} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {badges.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>Insignias recientes</h2>
          <div className="flex flex-wrap gap-3">
            {badges.map(b => (
              <div key={b.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: '#00BC70', color: '#001B71' }}>
                {'\u{1F3C5}'} {b.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <p className="text-gray-500 text-sm">{label}</p>
      <p className="text-3xl font-bold font-title" style={{ color }}>{value}</p>
    </div>
  );
}
