import { useState, useEffect } from 'react';
import api from '../../../lib/api';
import TargetSelector from '../../../components/TargetSelector';

export default function AdminPhishing() {
  const [tab, setTab] = useState('campaigns');
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [ous, setOUs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', html_body: '', difficulty: 'medium', category: '', red_flags: [] });
  const [campaignForm, setCampaignForm] = useState({ name: '', template_id: '', org_unit_scope: '', targets: { user_ids: [], ou_ids: [], group_ids: [] } });
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [c, t, o] = await Promise.all([
        api.get('/admin/phishing/campaigns'),
        api.get('/admin/phishing/templates'),
        api.get('/admin/org-units').catch(() => ({ data: { data: [] } })),
      ]);
      setCampaigns(c.data.data || []);
      setTemplates(t.data.data || []);
      setOUs(o.data.data || []);
    } catch { }
    setLoading(false);
  }

  async function createTemplate(e) {
    e.preventDefault();
    try {
      await api.post('/admin/phishing/templates', templateForm);
      setShowNewTemplate(false);
      setTemplateForm({ name: '', subject: '', html_body: '', difficulty: 'medium', category: '', red_flags: [] });
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function createCampaign(e) {
    e.preventDefault();
    try {
      await api.post('/admin/phishing/campaigns', {
        name: campaignForm.name,
        template_id: campaignForm.template_id,
        org_unit_scope: campaignForm.org_unit_scope || null,
        targets: campaignForm.targets,
      });
      setShowNewCampaign(false);
      setShowTargetSelector(false);
      setCampaignForm({ name: '', template_id: '', org_unit_scope: '', targets: { user_ids: [], ou_ids: [], group_ids: [] } });
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function updateCampaign(e) {
    e.preventDefault();
    if (!editCampaign) return;
    try {
      await api.put(`/admin/phishing/campaigns/${editCampaign.id}`, {
        name: editCampaign.name,
        template_id: editCampaign.template_id,
        org_unit_scope: editCampaign.org_unit_scope || null,
      });
      setEditCampaign(null);
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error al actualizar'); }
  }

  async function deleteCampaign(id) {
    if (!confirm('¿Eliminar esta campaña? Se borrarán todos sus resultados.')) return;
    try {
      await api.delete(`/admin/phishing/campaigns/${id}`);
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error al eliminar'); }
  }

  async function sendCampaign(id) {
    if (!confirm('¿Enviar esta campaña de phishing simulado? Se enviarán correos a los destinatarios.')) return;
    try {
      const { data } = await api.post(`/admin/phishing/campaigns/${id}/send`);
      alert(`Campaña enviada: ${data.sent}/${data.total} correos`);
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error al enviar'); }
  }

  async function viewStats(id) {
    try {
      const { data } = await api.get(`/admin/phishing/campaigns/${id}/stats`);
      setStats(data);
    } catch { }
  }

  async function deleteTemplate(id) {
    if (!confirm('¿Desactivar esta plantilla?')) return;
    try {
      await api.delete(`/admin/phishing/templates/${id}`);
      loadData();
    } catch { }
  }

  const tabs = [
    { id: 'campaigns', label: 'Campañas' },
    { id: 'templates', label: 'Plantillas' },
    { id: 'results', label: 'Resultados' },
  ];

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Phishing Simulado</h1>
        <div className="flex gap-2">
          {tab === 'campaigns' && (
            <button onClick={() => setShowNewCampaign(true)} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
              + Nueva campaña
            </button>
          )}
          {tab === 'templates' && (
            <button onClick={() => setShowNewTemplate(true)} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
              + Nueva plantilla
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-0 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-[#001B71] text-[#001B71]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* CAMPAIGNS TAB */}
      {tab === 'campaigns' && (
        <div className="space-y-3">
          {campaigns.length === 0 && <p className="text-gray-400 text-center py-8">No hay campañas creadas.</p>}
          {campaigns.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium" style={{ color: '#001B71' }}>{c.name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Plantilla: {c.template_name} · Estado: <span className={`font-medium ${c.status === 'completed' ? 'text-green-600' : c.status === 'draft' ? 'text-amber-600' : 'text-blue-600'}`}>{c.status}</span>
                    {c.org_unit_name && <> · Grupo: {c.org_unit_name}</>}
                  </p>
                  {c.sent_at && <p className="text-xs text-gray-400">Enviada: {new Date(c.sent_at).toLocaleDateString('es-GT')}</p>}
                  {c.event_count > 0 && <p className="text-xs text-gray-500 mt-1">{c.event_count} eventos · {c.click_count} clicks</p>}
                </div>
                <div className="flex items-center gap-2">
                  {c.status === 'draft' && (
                    <>
                      <button onClick={() => sendCampaign(c.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#00BC70' }}>
                        Enviar
                      </button>
                      <button onClick={() => setEditCampaign({ id: c.id, name: c.name, template_id: c.template_id, org_unit_scope: c.org_unit_scope || '' })}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                        Editar
                      </button>
                    </>
                  )}
                  <button onClick={() => viewStats(c.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                    Stats
                  </button>
                  <button onClick={() => deleteCampaign(c.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50">
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}

          {stats && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-title font-bold" style={{ color: '#001B71' }}>Resultados</h3>
                <button onClick={() => setStats(null)} className="text-gray-400 hover:text-gray-600">{'\u2715'}</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Destinatarios" value={stats.total_recipients} />
                <StatCard label="Abiertos" value={stats.events?.opened || 0} color="#2B5597" />
                <StatCard label="Clicks" value={stats.events?.clicked || 0} color="#e74c3c" />
                <StatCard label="Reportados" value={stats.events?.reported || 0} color="#00BC70" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* TEMPLATES TAB */}
      {tab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm" style={{ color: '#001B71' }}>{t.name}</p>
                  <p className="text-xs text-gray-400 mt-1">Asunto: {t.subject}</p>
                </div>
                <button onClick={() => deleteTemplate(t.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
              </div>
              <div className="mt-3 flex gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.difficulty === 'easy' ? 'bg-green-100 text-green-700' : t.difficulty === 'hard' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {t.difficulty === 'easy' ? 'Fácil' : t.difficulty === 'hard' ? 'Difícil' : 'Media'}
                </span>
                {t.category && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.category}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RESULTS TAB */}
      {tab === 'results' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Total campañas" value={campaigns.length} />
            <StatCard label="Enviadas" value={campaigns.filter(c => c.status === 'completed').length} color="#00BC70" />
            <StatCard label="Total clicks" value={campaigns.reduce((s, c) => s + parseInt(c.click_count || 0), 0)} color="#e74c3c" />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-title font-bold mb-4" style={{ color: '#001B71' }}>Historial</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400 border-b">
                <th className="pb-2">Campaña</th><th className="pb-2">Plantilla</th><th className="pb-2">Estado</th><th className="pb-2">Eventos</th><th className="pb-2">Clicks</th>
              </tr></thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} className="border-b border-gray-50">
                    <td className="py-2.5 font-medium">{c.name}</td>
                    <td className="py-2.5 text-gray-500">{c.template_name}</td>
                    <td className="py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span></td>
                    <td className="py-2.5 text-gray-500">{c.event_count || 0}</td>
                    <td className="py-2.5 text-red-600 font-medium">{c.click_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Nueva Plantilla */}
      {showNewTemplate && (
        <Modal title="Nueva plantilla de phishing" onClose={() => setShowNewTemplate(false)}>
          <form onSubmit={createTemplate} className="space-y-4">
            <Input label="Nombre" value={templateForm.name} onChange={v => setTemplateForm({ ...templateForm, name: v })} required />
            <Input label="Asunto del correo" value={templateForm.subject} onChange={v => setTemplateForm({ ...templateForm, subject: v })} required />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuerpo HTML</label>
              <textarea value={templateForm.html_body} onChange={e => setTemplateForm({ ...templateForm, html_body: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm h-32 font-mono" placeholder={'<html><body>\n  <p>Estimado {{displayName}},</p>\n  <a href="{{trackingUrl}}">Clic aquí</a>\n</body></html>'} required />
              <p className="text-xs text-gray-400 mt-1">Use {'{{trackingUrl}}'}, {'{{displayName}}'}, {'{{email}}'}, {'{{firstName}}'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Dificultad</label>
                <select value={templateForm.difficulty} onChange={e => setTemplateForm({ ...templateForm, difficulty: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="easy">Fácil</option><option value="medium">Media</option><option value="hard">Difícil</option>
                </select>
              </div>
              <Input label="Categoría" value={templateForm.category} onChange={v => setTemplateForm({ ...templateForm, category: v })} placeholder="ej: Financiero" />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Crear plantilla</button>
          </form>
        </Modal>
      )}

      {/* MODAL: Nueva Campaña */}
      {showNewCampaign && (
        <Modal title="Nueva campaña de phishing" onClose={() => { setShowNewCampaign(false); setShowTargetSelector(false); }}>
          <form onSubmit={createCampaign} className="space-y-4">
            <Input label="Nombre de la campaña" value={campaignForm.name} onChange={v => setCampaignForm({ ...campaignForm, name: v })} required />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Plantilla</label>
              <select value={campaignForm.template_id} onChange={e => setCampaignForm({ ...campaignForm, template_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">Seleccionar plantilla...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.difficulty})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destinatarios</label>
              {!showTargetSelector ? (
                <div>
                  <button type="button" onClick={() => setShowTargetSelector(true)}
                    className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-3 text-sm text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors">
                    {(campaignForm.targets.user_ids.length + campaignForm.targets.ou_ids.length + campaignForm.targets.group_ids.length) > 0
                      ? `${campaignForm.targets.user_ids.length} usuarios, ${campaignForm.targets.ou_ids.length} OUs, ${campaignForm.targets.group_ids.length} grupos seleccionados`
                      : 'Clic para seleccionar destinatarios (o dejar vacío para toda la org)'}
                  </button>
                </div>
              ) : (
                <TargetSelector
                  value={campaignForm.targets}
                  onChange={(targets) => { setCampaignForm({ ...campaignForm, targets }); setShowTargetSelector(false); }}
                  onClose={() => setShowTargetSelector(false)}
                />
              )}
            </div>
            {!showTargetSelector && (
              <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Crear campaña (borrador)</button>
            )}
          </form>
        </Modal>
      )}

      {/* MODAL: Editar Campaña */}
      {editCampaign && (
        <Modal title="Editar campaña" onClose={() => setEditCampaign(null)}>
          <form onSubmit={updateCampaign} className="space-y-4">
            <Input label="Nombre" value={editCampaign.name} onChange={v => setEditCampaign({ ...editCampaign, name: v })} required />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Plantilla</label>
              <select value={editCampaign.template_id} onChange={e => setEditCampaign({ ...editCampaign, template_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">Seleccionar...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.difficulty})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grupo objetivo</label>
              <select value={editCampaign.org_unit_scope} onChange={e => setEditCampaign({ ...editCampaign, org_unit_scope: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Toda la organización</option>
                {ous.map(ou => <option key={ou.id} value={ou.id}>{ou.name}</option>)}
              </select>
            </div>
            <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Guardar cambios</button>
          </form>
        </Modal>
      )}
    </div>
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">{'\u2715'}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, required, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm" placeholder={placeholder} required={required} />
    </div>
  );
}
