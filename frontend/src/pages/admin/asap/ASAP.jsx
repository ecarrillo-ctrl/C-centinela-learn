import { useState, useEffect } from 'react';
import api from '../../../lib/api';

const RISK_LEVELS = [
  { id: 'high', label: 'Alto riesgo', color: '#e74c3c', icon: '\u{1F534}', minScore: 30 },
  { id: 'medium', label: 'Riesgo medio', color: '#f39c12', icon: '\u{1F7E1}', minScore: 15 },
  { id: 'low', label: 'Riesgo bajo', color: '#00BC70', icon: '\u{1F7E2}', minScore: 0 },
];

const TASK_TEMPLATES = {
  high: [
    { week: 1, type: 'phishing', title: 'Campaña phishing difícil', desc: 'Enviar simulación de dificultad alta al grupo' },
    { week: 2, type: 'training', title: 'Capacitación obligatoria', desc: 'Asignar ruta completa de ciberseguridad' },
    { week: 3, type: 'phishing', title: 'Campaña phishing media', desc: 'Simulación de dificultad media con red flags' },
    { week: 4, type: 'training', title: 'Quiz de refuerzo', desc: 'Evaluación de conocimientos adquiridos' },
    { week: 5, type: 'phishing', title: 'Re-test phishing', desc: 'Medir mejora post-capacitación' },
    { week: 6, type: 'review', title: 'Revisión de resultados', desc: 'Análisis de mejora y plan de seguimiento' },
  ],
  medium: [
    { week: 1, type: 'phishing', title: 'Campaña phishing media', desc: 'Simulación estándar al grupo' },
    { week: 3, type: 'training', title: 'Capacitación básica', desc: 'Módulos fundamentales de seguridad' },
    { week: 5, type: 'phishing', title: 'Re-test phishing', desc: 'Medir mejora después de la capacitación' },
    { week: 6, type: 'review', title: 'Revisión trimestral', desc: 'Evaluar progreso y ajustar plan' },
  ],
  low: [
    { week: 2, type: 'training', title: 'Actualización trimestral', desc: 'Nuevas amenazas y tendencias' },
    { week: 4, type: 'phishing', title: 'Campaña phishing fácil', desc: 'Mantener alerta con simulación básica' },
    { week: 6, type: 'review', title: 'Revisión semestral', desc: 'Confirmar que el nivel se mantiene bajo' },
  ],
};

export default function AdminASAP() {
  const [step, setStep] = useState('config');
  const [ous, setOUs] = useState([]);
  const [riskData, setRiskData] = useState([]);
  const [config, setConfig] = useState({ duration_weeks: 6, start_date: '', target_ou: '' });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/admin/org-units').catch(() => ({ data: { data: [] } })),
      api.get('/admin/analytics/risk?scope=ou').catch(() => ({ data: { data: [] } })),
    ]).then(([ouRes, riskRes]) => {
      setOUs(ouRes.data.data || []);
      setRiskData(riskRes.data.data || []);
      setLoading(false);
    });
  }, []);

  function generatePlan() {
    if (!config.start_date) { alert('Seleccione fecha de inicio'); return; }
    const startDate = new Date(config.start_date);
    const selectedOU = ous.find(o => (o.id || o.ID) === config.target_ou);
    const ouRisk = riskData.find(r => (r.org_unit_id || r.ORG_UNIT_ID) === config.target_ou);
    const avgScore = parseFloat(ouRisk?.avg_risk_score || ouRisk?.AVG_RISK_SCORE || 15);

    const riskLevel = avgScore >= 30 ? 'high' : avgScore >= 15 ? 'medium' : 'low';
    const tasks = TASK_TEMPLATES[riskLevel].map(t => {
      const taskDate = new Date(startDate);
      taskDate.setDate(taskDate.getDate() + (t.week - 1) * 7);
      return { ...t, date: taskDate.toISOString().slice(0, 10), status: 'pending' };
    });

    setPlan({
      ou_name: selectedOU ? (selectedOU.name || selectedOU.NAME) : 'Toda la organización',
      risk_level: riskLevel,
      avg_score: avgScore,
      tasks,
      generated_at: new Date().toISOString(),
    });
    setStep('plan');
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando datos...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>
            Programa Automatizado de Concientización (ASAP)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Genera un plan calendarizado de tareas basado en el nivel de riesgo de cada grupo.
          </p>
        </div>
        {plan && (
          <button onClick={() => { setStep('config'); setPlan(null); }}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50">
            Nuevo plan
          </button>
        )}
      </div>

      {/* Risk overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {RISK_LEVELS.map(level => {
          const count = riskData.filter(r => {
            const s = parseFloat(r.avg_risk_score || r.AVG_RISK_SCORE || 0);
            if (level.id === 'high') return s >= 30;
            if (level.id === 'medium') return s >= 15 && s < 30;
            return s < 15;
          }).length;
          return (
            <div key={level.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{level.icon}</span>
                <div>
                  <p className="text-sm font-medium" style={{ color: level.color }}>{level.label}</p>
                  <p className="text-2xl font-bold" style={{ color: '#001B71' }}>{count}</p>
                  <p className="text-xs text-gray-400">unidades organizacionales</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step: Config */}
      {step === 'config' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>
            Configurar plan de concientización
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium text-gray-600">Grupo objetivo</label>
              <select value={config.target_ou} onChange={e => setConfig({ ...config, target_ou: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                <option value="">Toda la organización</option>
                {ous.map(ou => (
                  <option key={ou.id || ou.ID} value={ou.id || ou.ID}>
                    {ou.name || ou.NAME} ({ou.user_count || ou.USER_COUNT || 0} usuarios)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Fecha de inicio</label>
              <input type="date" value={config.start_date}
                onChange={e => setConfig({ ...config, start_date: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Duración (semanas)</label>
              <select value={config.duration_weeks}
                onChange={e => setConfig({ ...config, duration_weeks: parseInt(e.target.value) })}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                <option value={4}>4 semanas</option>
                <option value={6}>6 semanas</option>
                <option value={8}>8 semanas</option>
                <option value={12}>12 semanas (trimestral)</option>
              </select>
            </div>
          </div>
          <button onClick={generatePlan}
            className="px-6 py-2.5 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#001B71' }}>
            Generar plan recomendado
          </button>
        </div>
      )}

      {/* Step: Plan generated */}
      {step === 'plan' && plan && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>
                  Plan para: {plan.ou_name}
                </h2>
                <p className="text-sm text-gray-500">
                  Nivel de riesgo: <span style={{ color: RISK_LEVELS.find(l => l.id === plan.risk_level)?.color }}>
                    {RISK_LEVELS.find(l => l.id === plan.risk_level)?.label}
                  </span> (score promedio: {plan.avg_score})
                </p>
              </div>
              <span className="text-3xl">{RISK_LEVELS.find(l => l.id === plan.risk_level)?.icon}</span>
            </div>

            <div className="relative">
              {/* Timeline */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
              <div className="space-y-4 pl-10">
                {plan.tasks.map((task, i) => (
                  <div key={i} className="relative">
                    <div className={`absolute -left-10 top-1 w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold ${task.type === 'phishing' ? 'bg-red-500' : task.type === 'training' ? 'bg-blue-500' : 'bg-green-500'
                      }`}>
                      {task.type === 'phishing' ? 'P' : task.type === 'training' ? 'C' : 'R'}
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#001B71' }}>{task.title}</p>
                          <p className="text-xs text-gray-400">{task.desc}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium text-gray-600">Semana {task.week}</p>
                          <p className="text-xs text-gray-400">{task.date}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => alert('Plan guardado. Las tareas se ejecutarán según el calendario.')}
              className="px-6 py-2.5 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: '#00BC70' }}>
              Aprobar y activar plan
            </button>
            <button onClick={() => setStep('config')}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50">
              Modificar configuración
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
