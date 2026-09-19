import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import BadgeIcon from '../../components/BadgeIcon';
import { useAuth } from '../../context/AuthContext';

const LEVEL_INFO = {
  bajo: { label: 'Bajo', color: '#00BC70' },
  medio: { label: 'Medio', color: '#f39c12' },
  alto: { label: 'Alto', color: '#e74c3c' },
};

export default function UserDashboard() {
  const { user } = useAuth();
  const [paths, setPaths] = useState([]);
  const [badges, setBadges] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [phishStats, setPhishStats] = useState(null);
  const [riskScore, setRiskScore] = useState(null);
  const [showRiskExplained, setShowRiskExplained] = useState(false);

  useEffect(() => {
    api.get('/library/learning-paths').then(r => setPaths(r.data.data || [])).catch(() => { });
    api.get('/library/badges').then(r => setBadges((r.data.data || []).filter(b => b.earned))).catch(() => { });
    api.get('/notifications?unread=true').then(r => setUnreadCount(r.data.unread_count || 0)).catch(() => { });
    api.get('/phishing/my-stats').then(r => setPhishStats(r.data)).catch(() => { });
    api.get('/auth/me').then(r => setRiskScore(parseFloat(r.data.user?.risk_score) || 0)).catch(() => { });
  }, []);

  const completedPaths = paths.filter(p => p.all_completed).length;
  const totalPaths = paths.length;
  const allDone = totalPaths > 0 && completedPaths === totalPaths;
  const nextPath = paths.find(p => !p.all_completed);

  const level = riskScore == null ? null
    : riskScore < 20 ? LEVEL_INFO.bajo : riskScore < 40 ? LEVEL_INFO.medio : LEVEL_INFO.alto;
  const segments = riskScore == null ? 0 : riskScore < 20 ? 1 : riskScore < 40 ? 2 : 4;

  return (
    <div className="space-y-6">
      <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>
        Bienvenido{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
      </h1>

      {allDone ? (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#FCEEE3' }}>
          <span className="text-4xl block mb-2">{'\u{2705}'}</span>
          <p className="font-medium" style={{ color: '#001B71' }}>
            {'\u{1F389}'} ¡Ha completado todas las capacitaciones asignadas! Esté pendiente de su bandeja de
            entrada para su próxima tarea de capacitación.
          </p>
        </div>
      ) : totalPaths > 0 && nextPath ? (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#FCEEE3' }}>
          <span className="text-4xl block mb-2">{'\u{1F4DA}'}</span>
          <p className="font-medium" style={{ color: '#001B71' }}>
            Tiene capacitación pendiente en <strong>{nextPath.name}</strong>.
          </p>
          <Link to="/training" className="inline-block mt-3 px-5 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: '#00BC70' }}>
            Continuar capacitación
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardCard>
          <CardHeader icon={'\u{1F4EC}'} title="Mensajes" />
          {unreadCount > 0 ? (
            <p className="text-sm text-gray-600 mb-3">Tiene <strong>{unreadCount}</strong> mensaje{unreadCount !== 1 ? 's' : ''} sin leer.</p>
          ) : (
            <p className="text-sm text-gray-400 mb-3">No hay mensajes sin leer.</p>
          )}
          <Link to="/messages" className="inline-block px-4 py-2 rounded-lg text-sm font-medium text-white text-center w-full"
            style={{ backgroundColor: '#001B71' }}>
            Ver mensajes
          </Link>
        </DashboardCard>

        <DashboardCard>
          <CardHeader icon={'\u{2709}\u{FE0F}'} title="Puntaje de la prueba de phishing" />
          {!phishStats || phishStats.delivered === 0 ? (
            <p className="text-xs text-gray-400 py-2">Aún no ha recibido campañas de phishing simulado.</p>
          ) : (
            <div className="space-y-3">
              <MiniStat label="Correos de phishing reportados" value={phishStats.reported} total={phishStats.delivered} color="#00BC70" />
              <MiniStat label="Errores de phishing (dio clic)" value={phishStats.clicked} total={phishStats.delivered} color="#e74c3c" />
            </div>
          )}
        </DashboardCard>

        <DashboardCard>
          <CardHeader icon={'\u{26A0}\u{FE0F}'} title="Puntaje de riesgo personal" />
          {level ? (
            <>
              <p className="text-2xl font-bold" style={{ color: level.color }}>{level.label}</p>
              <p className="text-xs text-gray-500 mb-2">Puntaje de riesgo: <strong>{riskScore}</strong></p>
              <div className="flex gap-1 mb-2">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="h-2 flex-1 rounded-full" style={{ backgroundColor: i < segments ? level.color : '#e5e7eb' }} />
                ))}
              </div>
              <button onClick={() => setShowRiskExplained(v => !v)} className="text-xs" style={{ color: '#2B5597' }}>
                {'ⓘ'} ¿Por qué cambió mi puntaje?
              </button>
              {showRiskExplained && (
                <p className="text-xs text-gray-500 mt-2">
                  Sube al caer en phishing simulado y baja al completar capacitaciones o reportar correos
                  sospechosos con el botón de reporte de phishing. Los eventos antiguos pierden peso con el tiempo.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400 py-2">Cargando...</p>
          )}
        </DashboardCard>

        <DashboardCard>
          <CardHeader icon={'\u{1F3C5}'} title="Insignias" badge={badges.length} />
          <p className="text-sm text-gray-600 mb-3">
            {badges.length > 0
              ? `¡Obtuvo ${badges.length} insignia${badges.length !== 1 ? 's' : ''} durante su capacitación!`
              : 'Aún no ha obtenido insignias.'}
          </p>
          <Link to="/badges" className="inline-block px-4 py-2 rounded-lg text-sm font-medium text-center w-full border border-gray-200 hover:bg-gray-50"
            style={{ color: '#001B71' }}>
            {badges.length > 0 ? 'Ver insignias' : 'Aprenda cómo ganar insignias'}
          </Link>
        </DashboardCard>
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
                <BadgeIcon name={b.icon_url} size={28} /> {b.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardCard({ children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col">
      {children}
    </div>
  );
}

function CardHeader({ icon, title, badge }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-lg">{icon}</span>
      <h3 className="text-sm font-semibold flex-1" style={{ color: '#001B71' }}>{title}</h3>
      {badge > 0 && (
        <span className="text-xs font-bold text-white rounded-full w-5 h-5 flex items-center justify-center"
          style={{ backgroundColor: '#00BC70' }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function MiniStat({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-medium">{value}/{total}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
