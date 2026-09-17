import { useState, useEffect } from 'react';
import api from '../../../lib/api';
import TargetSelector from '../../../components/TargetSelector';

export default function AdminTraining() {
  const [tab, setTab] = useState('campaigns');
  const [paths, setPaths] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [courses, setCourses] = useState([]);
  const [ous, setOUs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewPath, setShowNewPath] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [pathForm, setPathForm] = useState({ name: '', description: '', course_ids: [] });
  const [editPathId, setEditPathId] = useState(null);
  const [campaignForm, setCampaignForm] = useState({ name: '', description: '', path_id: '', org_unit_scope: '', due_at: '', targets: { user_ids: [], ou_ids: [], group_ids: [] } });
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [progress, setProgress] = useState({ by_ou: [], summary: {} });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [p, c, tc, ou, tp] = await Promise.all([
        api.get('/admin/learning-paths'),
        api.get('/admin/content'),
        api.get('/admin/training-campaigns').catch(() => ({ data: { data: [] } })),
        api.get('/admin/org-units').catch(() => ({ data: { data: [] } })),
        api.get('/admin/analytics/training-progress').catch(() => ({ data: { by_ou: [], summary: {} } })),
      ]);
      setPaths(p.data.data || []);
      setCourses(c.data.data || []);
      setCampaigns(tc.data.data || []);
      setOUs(ou.data.data || []);
      setProgress(tp.data || { by_ou: [], summary: {} });
    } catch { }
    setLoading(false);
  }

  async function createPath(e) {
    e.preventDefault();
    if (pathForm.course_ids.length === 0) return alert('Seleccione al menos un curso');
    try {
      if (editPathId) {
        await api.put(`/admin/learning-paths/${editPathId}`, pathForm);
      } else {
        await api.post('/admin/learning-paths', pathForm);
      }
      setShowNewPath(false);
      setEditPathId(null);
      setPathForm({ name: '', description: '', course_ids: [] });
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function createCampaign(e) {
    e.preventDefault();
    if (!campaignForm.path_id) return alert('Seleccione una ruta de aprendizaje');
    try {
      const { data } = await api.post('/admin/training-campaigns', campaignForm);
      alert(`Campaña "${campaignForm.name}" creada. Ahora puede lanzarla.`);
      setShowNewCampaign(false);
      setShowTargetSelector(false);
      setCampaignForm({ name: '', description: '', path_id: '', org_unit_scope: '', due_at: '', targets: { user_ids: [], ou_ids: [], group_ids: [] } });
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function launchCampaign(id, name, targetSummary) {
    if (!confirm(`¿Lanzar la campaña "${name}"?\n\nDestinatarios: ${targetSummary || 'Toda la organización'}\n\nEsto asignará todos los cursos de la ruta a los usuarios seleccionados.`)) return;
    try {
      const { data } = await api.post(`/admin/training-campaigns/${id}/launch`);
      alert(`Campaña lanzada:\n• ${data.users} usuarios\n• ${data.courses} cursos\n• ${data.enrollments} matrículas creadas`);
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error al lanzar'); }
  }

  function toggleCourse(courseId) {
    setPathForm(prev => ({
      ...prev,
      course_ids: prev.course_ids.includes(courseId)
        ? prev.course_ids.filter(id => id !== courseId)
        : [...prev.course_ids, courseId],
    }));
  }

  const tabs = [
    { id: 'campaigns', label: 'Campañas' },
    { id: 'paths', label: 'Rutas de aprendizaje' },
    { id: 'progress', label: 'Progreso' },
    { id: 'notifications', label: 'Recordatorios' },
  ];

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Capacitación</h1>
        <div className="flex gap-2">
          {tab === 'campaigns' && (
            <button onClick={() => setShowNewCampaign(true)} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#00BC70' }}>
              + Lanzar campaña
            </button>
          )}
          {tab === 'paths' && (
            <button onClick={() => setShowNewPath(true)} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
              + Nueva ruta
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-[#001B71] text-[#001B71]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ CAMPAIGNS TAB ============ */}
      {tab === 'campaigns' && (
        <div className="space-y-4">
          {campaigns.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p>No hay campañas de capacitación.</p>
              <p className="text-sm mt-1">Cree una ruta de aprendizaje primero, luego lance una campaña para asignarla a un grupo.</p>
            </div>
          )}
          {campaigns.map(c => {
            const id = c.id;
            const enrolled = parseInt(c.enrollment_count || 0);
            const completed = parseInt(c.completed_count || 0);
            const pct = enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;
            return (
              <div key={id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium" style={{ color: '#001B71' }}>{c.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Ruta: {c.path_name || '—'} · Destinatarios: <span className="font-medium text-gray-600">{c.target_summary || c.org_unit_name || 'Toda la organización'}</span>
                    </p>
                    {c.due_at && <p className="text-xs text-gray-400">Vence: {new Date(c.due_at).toLocaleDateString('es-GT')}</p>}
                  </div>
                  <div className="text-right flex items-center gap-2">
                    {enrolled > 0 && (
                      <div className="text-right mr-2">
                        <p className="text-lg font-bold" style={{ color: pct === 100 ? '#00BC70' : '#001B71' }}>{pct}%</p>
                        <p className="text-xs text-gray-400">{completed}/{enrolled} matriculados</p>
                      </div>
                    )}
                    <button onClick={() => launchCampaign(id, c.name, c.target_summary || c.org_unit_name)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ backgroundColor: enrolled > 0 ? '#2B5597' : '#00BC70' }}>
                      {enrolled > 0 ? 'Re-lanzar' : 'Lanzar'}
                    </button>
                    <button onClick={async () => {
                      if (!confirm(`¿Eliminar campaña "${c.name}"? Se borrarán todas las matrículas asociadas.`)) return;
                      try { await api.delete(`/admin/training-campaigns/${id}`); loadData(); } catch (err) { alert(err.response?.data?.error || 'Error'); }
                    }} className="px-2 py-1.5 rounded-lg text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50">
                      Eliminar
                    </button>
                  </div>
                </div>
                {enrolled > 0 && (
                  <div className="mt-3 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#00BC70' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ============ PATHS TAB ============ */}
      {tab === 'paths' && (
        <div className="space-y-4">
          {paths.length === 0 && <p className="text-gray-400 text-center py-8">No hay rutas de aprendizaje. Cree una para organizar sus cursos.</p>}
          {paths.map(p => {
            const pathCourses = p.courses || [];
            return (
              <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium" style={{ color: '#001B71' }}>{p.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">{p.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{pathCourses.length} cursos</span>
                    <button onClick={() => {
                      setPathForm({ name: p.name, description: p.description || '', course_ids: pathCourses.map(c => c.id || c.ID) });
                      setEditPathId(p.id);
                      setShowNewPath(true);
                    }} className="px-2 py-1 rounded text-xs border border-gray-200 text-gray-500 hover:bg-gray-50">
                      Editar
                    </button>
                    <button onClick={async () => {
                      if (!confirm(`¿Eliminar la ruta "${p.name}"?`)) return;
                      try { await api.delete(`/admin/learning-paths/${p.id}`); loadData(); } catch (err) { alert(err.response?.data?.error || 'Error'); }
                    }} className="px-2 py-1 rounded text-xs text-red-500 border border-red-200 hover:bg-red-50">
                      Eliminar
                    </button>
                  </div>
                </div>
                {pathCourses.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pathCourses.map((c, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                        {i + 1}. {c.title || c.TITLE}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ============ PROGRESS TAB ============ */}
      {tab === 'progress' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="Asignados" value={progress.summary?.assigned || 0} />
            <StatCard label="En progreso" value={progress.summary?.in_progress || 0} color="#2B5597" />
            <StatCard label="Completados" value={progress.summary?.completed || 0} color="#00BC70" />
            <StatCard label="% Completado" value={`${progress.summary?.overall_pct || 0}%`} color="#001B71" />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-title font-bold mb-4" style={{ color: '#001B71' }}>Progreso por unidad organizacional</h3>
            {(progress.by_ou || []).length > 0 ? (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-400 border-b">
                  <th className="pb-2">Unidad</th><th className="pb-2">Matriculados</th><th className="pb-2">Completados</th><th className="pb-2">% Completado</th>
                </tr></thead>
                <tbody>
                  {(progress.by_ou || []).map((ou, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2.5 font-medium">{ou.org_unit_name || '—'}</td>
                      <td className="py-2.5 text-gray-500">{ou.users_enrolled || 0}</td>
                      <td className="py-2.5 text-green-600">{ou.completed || 0}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${ou.completion_rate_pct || 0}%`, backgroundColor: '#00BC70' }} />
                          </div>
                          <span className="text-xs">{ou.completion_rate_pct || 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-gray-400 text-sm text-center py-4">Sin datos de progreso aún. Lance una campaña primero.</p>}
          </div>
        </div>
      )}

      {/* ============ NOTIFICATIONS TAB ============ */}
      {tab === 'notifications' && <NotificationsPanel />}

      {/* ============ MODAL: Nueva/Editar Ruta ============ */}
      {showNewPath && (
        <Modal title={editPathId ? 'Editar ruta de aprendizaje' : 'Nueva ruta de aprendizaje'}
          onClose={() => { setShowNewPath(false); setEditPathId(null); setPathForm({ name: '', description: '', course_ids: [] }); }}>
          <form onSubmit={createPath} className="space-y-4">
            <Input label="Nombre" value={pathForm.name} onChange={v => setPathForm({ ...pathForm, name: v })} required />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
              <textarea value={pathForm.description} onChange={e => setPathForm({ ...pathForm, description: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm h-20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Cursos (seleccione en orden)</label>
              <div className="max-h-48 overflow-auto space-y-1 border rounded-lg p-2">
                {courses.map(c => {
                  const cId = c.id;
                  const selected = pathForm.course_ids.includes(cId);
                  const order = pathForm.course_ids.indexOf(cId) + 1;
                  return (
                    <label key={cId} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={selected} onChange={() => toggleCourse(cId)} className="rounded" />
                      <span className="text-sm">{selected && <span className="font-bold text-blue-600 mr-1">{order}.</span>}{c.title}</span>
                    </label>
                  );
                })}
              </div>
              {courses.length === 0 && <p className="text-xs text-gray-400 mt-1">No hay cursos. Suba contenido primero.</p>}
              <p className="text-xs text-gray-400 mt-1">Seleccionados: {pathForm.course_ids.length}</p>
            </div>
            <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>{editPathId ? 'Guardar cambios' : 'Crear ruta'}</button>
          </form>
        </Modal>
      )
      }

      {/* ============ MODAL: Lanzar Campaña ============ */}
      {
        showNewCampaign && (
          <Modal title="Lanzar campaña de capacitación" onClose={() => setShowNewCampaign(false)}>
            <form onSubmit={createCampaign} className="space-y-4">
              <Input label="Nombre de la campaña" value={campaignForm.name} onChange={v => setCampaignForm({ ...campaignForm, name: v })} required placeholder="ej: Capacitación BASC Q3 2026" />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <textarea value={campaignForm.description} onChange={e => setCampaignForm({ ...campaignForm, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm h-16" placeholder="Descripción opcional..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ruta de aprendizaje *</label>
                <select value={campaignForm.path_id} onChange={e => setCampaignForm({ ...campaignForm, path_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" required>
                  <option value="">Seleccionar ruta...</option>
                  {paths.map(p => <option key={p.id} value={p.id}>{p.name} ({(p.courses || []).length} cursos)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Asignar a</label>
                {!showTargetSelector ? (
                  <button type="button" onClick={() => setShowTargetSelector(true)}
                    className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-3 text-sm text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors">
                    {(campaignForm.targets.user_ids.length + campaignForm.targets.ou_ids.length + campaignForm.targets.group_ids.length) > 0
                      ? `${campaignForm.targets.user_ids.length} usuarios, ${campaignForm.targets.ou_ids.length} OUs, ${campaignForm.targets.group_ids.length} grupos`
                      : 'Seleccionar destinatarios (vacío = toda la org)'}
                  </button>
                ) : (
                  <TargetSelector
                    value={campaignForm.targets}
                    onChange={(targets) => { setCampaignForm({ ...campaignForm, targets }); setShowTargetSelector(false); }}
                    onClose={() => setShowTargetSelector(false)}
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de vencimiento</label>
                <input type="date" value={campaignForm.due_at} onChange={e => setCampaignForm({ ...campaignForm, due_at: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-gray-400 mt-1">Opcional. Si se define, se enviarán recordatorios antes del vencimiento.</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  Al crear la campaña, queda en estado "borrador". Después debe hacer clic en "Lanzar" para asignar los cursos a todos los usuarios del grupo.
                </p>
              </div>
              {!showTargetSelector && (
                <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#00BC70' }}>Crear campaña</button>
              )}
            </form>
          </Modal>
        )
      }
    </div >
  );
}

function NotificationsPanel() {
  const [cfg, setCfg] = useState({ reminder_days: '7', auto_upcoming: true, auto_overdue_managers: true, auto_overdue_users: false });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState('');

  useEffect(() => {
    api.get('/admin/settings?category=training').then(r => {
      const s = r.data.data?.training || {};
      setCfg(prev => ({
        ...prev,
        reminder_days: s.training_reminder_days || '7',
      }));
    }).catch(() => { });
  }, []);

  async function saveConfig() {
    setSaving(true);
    try {
      await api.put('/admin/settings', { settings: { training_reminder_days: cfg.reminder_days } });
      alert('Configuración guardada');
    } catch { alert('Error al guardar'); }
    setSaving(false);
  }

  async function sendNotification(type) {
    setSending(type);
    try {
      const endpoints = {
        upcoming: '/admin/notifications/upcoming',
        overdue_users: '/admin/notifications/overdue-users',
        overdue_managers: '/admin/notifications/overdue',
      };
      const { data } = await api.post(endpoints[type]);
      const messages = {
        upcoming: `Recordatorios enviados:\n- ${data.sent} correos\n- ${data.totalUsers || 0} usuarios\n- Ventana: ${data.reminderDays || cfg.reminder_days} días`,
        overdue_users: `Alertas enviadas:\n- ${data.sent} correos a usuarios\n- ${data.totalOverdue || 0} capacitaciones vencidas`,
        overdue_managers: `Reporte enviado:\n- ${data.sent} correos a admins\n- ${data.totalUsers || 0} usuarios afectados`,
      };
      alert(messages[type] || `Enviado: ${data.sent} correos`);
    } catch (err) { alert(err.response?.data?.error || 'Error al enviar'); }
    setSending('');
  }

  return (
    <div className="space-y-6">
      {/* Config */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-title font-bold mb-4" style={{ color: '#001B71' }}>Configuración de recordatorios</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Días de anticipación para recordatorio</label>
            <input type="number" min="1" max="30" value={cfg.reminder_days}
              onChange={e => setCfg({ ...cfg, reminder_days: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            <p className="text-xs text-gray-400 mt-1">Se envía correo a usuarios cuyas capacitaciones vencen dentro de estos días.</p>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-600 block">Automatización (cron)</label>
            <ToggleItem label="Recordatorio diario a usuarios (7:00 AM)" checked={cfg.auto_upcoming} onChange={v => setCfg({ ...cfg, auto_upcoming: v })} />
            <ToggleItem label="Reporte semanal a jefes (lunes 8:00 AM)" checked={cfg.auto_overdue_managers} onChange={v => setCfg({ ...cfg, auto_overdue_managers: v })} />
            <ToggleItem label="Alerta diaria de vencidos a usuarios" checked={cfg.auto_overdue_users} onChange={v => setCfg({ ...cfg, auto_overdue_users: v })} />
          </div>
        </div>
        <button onClick={saveConfig} disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#001B71' }}>
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>

      {/* Manual triggers */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-title font-bold mb-4" style={{ color: '#001B71' }}>Enviar correos manualmente</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NotifCard icon={'\u{23F0}'} title="Próximos a vencer" desc={`Correo a usuarios cuyas capacitaciones vencen en ${cfg.reminder_days} días`}
            color="#f39c12" borderColor="border-amber-200" bgColor="bg-amber-50"
            btnLabel={sending === 'upcoming' ? 'Enviando...' : 'Enviar recordatorio'}
            onClick={() => sendNotification('upcoming')} disabled={sending !== ''} />
          <NotifCard icon={'\u{1F6A8}'} title="Capacitaciones vencidas" desc="Alerta roja a usuarios que ya pasaron la fecha límite sin completar"
            color="#e74c3c" borderColor="border-red-200" bgColor="bg-red-50"
            btnLabel={sending === 'overdue_users' ? 'Enviando...' : 'Alertar usuarios'}
            onClick={() => sendNotification('overdue_users')} disabled={sending !== ''} />
          <NotifCard icon={'\u{1F4CA}'} title="Reporte a jefes" desc="Tabla con OUs y usuarios pendientes, enviada a todos los administradores"
            color="#001B71" borderColor="border-blue-200" bgColor="bg-blue-50"
            btnLabel={sending === 'overdue_managers' ? 'Enviando...' : 'Enviar reporte'}
            onClick={() => sendNotification('overdue_managers')} disabled={sending !== ''} />
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs text-gray-500">
          <strong>Nota:</strong> Solo se envían correos a usuarios con estado <strong>activo</strong>.
          Los usuarios inactivos no recibirán recordatorios ni se les asignarán nuevas capacitaciones.
          Para configurar SMTP vaya a Configuración → Integraciones.
        </p>
      </div>
    </div>
  );
}

function NotifCard({ icon, title, desc, color, borderColor, bgColor, btnLabel, onClick, disabled }) {
  return (
    <div className={`border ${borderColor} rounded-xl p-5 ${bgColor}`}>
      <div className="text-2xl mb-2">{icon}</div>
      <h4 className="font-bold text-sm" style={{ color: '#001B71' }}>{title}</h4>
      <p className="text-xs text-gray-500 mt-1 mb-4">{desc}</p>
      <button onClick={onClick} disabled={disabled}
        className="w-full py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: color }}>
        {btnLabel}
      </button>
    </div>
  );
}

function ToggleItem({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between p-2 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-50">
      <span className="text-xs text-gray-600">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-green-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'left-4' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

function StatCard({ label, value, color = '#001B71' }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, required, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm" placeholder={placeholder} required={required} />
    </div>
  );
}
