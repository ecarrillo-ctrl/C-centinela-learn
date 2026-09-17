import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../../lib/api';
import TargetSelector from '../../../components/TargetSelector';

export default function AdminPhishing() {
  const [tab, setTab] = useState('overview');
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [corporatePages, setCorporatePages] = useState([]);
  const [domains, setDomains] = useState([]);
  const [overview, setOverview] = useState(null);
  const [ous, setOUs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showNewCorporatePage, setShowNewCorporatePage] = useState(false);
  const [showNewDomain, setShowNewDomain] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', html_body: '', difficulty: 'medium', category: '', red_flags: [] });
  const [campaignForm, setCampaignForm] = useState({ name: '', template_id: '', org_unit_scope: '', corporate_page_id: '', targets: { user_ids: [], ou_ids: [], group_ids: [] } });
  const [corporatePageForm, setCorporatePageForm] = useState({ name: '', real_url: '', lookalike_url: '' });
  const [domainForm, setDomainForm] = useState({ domain: '', notes: '' });
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [stats, setStats] = useState(null);
  const [targetReport, setTargetReport] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [sendingTest, setSendingTest] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [c, t, cp, d, ov, o] = await Promise.all([
        api.get('/admin/phishing/campaigns'),
        api.get('/admin/phishing/templates'),
        api.get('/admin/phishing/corporate-pages').catch(() => ({ data: { data: [] } })),
        api.get('/admin/phishing/domains').catch(() => ({ data: { data: [] } })),
        api.get('/admin/phishing/overview').catch(() => ({ data: null })),
        api.get('/admin/org-units').catch(() => ({ data: { data: [] } })),
      ]);
      setCampaigns(c.data.data || []);
      setTemplates(t.data.data || []);
      setCorporatePages(cp.data.data || []);
      setDomains(d.data.data || []);
      setOverview(ov.data);
      setOUs(o.data.data || []);
    } catch { }
    setLoading(false);
  }

  function renderPreview(templateId, corporatePageId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) { alert('Seleccione una plantilla primero'); return; }
    const corpPage = corporatePages.find(p => p.id === corporatePageId);

    const html = (template.html_body || '')
      .replace(/{{firstName}}/g, 'Juan')
      .replace(/{{displayName}}/g, 'Juan Pérez')
      .replace(/{{email}}/g, 'juan.perez@agroamerica.com')
      .replace(/{{trackingUrl}}/g, '#vista-previa')
      .replace(/{{lookalikeUrl}}/g, corpPage?.lookalike_url || '');

    setPreviewHtml(html);
  }

  async function sendTest(campaignId) {
    setSendingTest(campaignId);
    try {
      const { data } = await api.post(`/admin/phishing/campaigns/${campaignId}/send-test`);
      alert(`Correo de prueba enviado a ${data.sent_to}. Ábralo y dé clic al enlace para validar la pantalla que verán los destinatarios reales.`);
    } catch (err) { alert(err.response?.data?.error || 'Error al enviar la prueba'); }
    setSendingTest(null);
  }

  async function createDomain(e) {
    e.preventDefault();
    try {
      await api.post('/admin/phishing/domains', domainForm);
      setShowNewDomain(false);
      setDomainForm({ domain: '', notes: '' });
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function deleteDomain(id) {
    if (!confirm('¿Desactivar este dominio?')) return;
    try {
      await api.delete(`/admin/phishing/domains/${id}`);
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error al eliminar'); }
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
        corporate_page_id: campaignForm.corporate_page_id || null,
        targets: campaignForm.targets,
      });
      setShowNewCampaign(false);
      setShowTargetSelector(false);
      setCampaignForm({ name: '', template_id: '', org_unit_scope: '', corporate_page_id: '', targets: { user_ids: [], ou_ids: [], group_ids: [] } });
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function createCorporatePage(e) {
    e.preventDefault();
    try {
      await api.post('/admin/phishing/corporate-pages', corporatePageForm);
      setShowNewCorporatePage(false);
      setCorporatePageForm({ name: '', real_url: '', lookalike_url: '' });
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function deleteCorporatePage(id) {
    if (!confirm('¿Desactivar esta página corporativa?')) return;
    try {
      await api.delete(`/admin/phishing/corporate-pages/${id}`);
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error al eliminar'); }
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
      const [{ data }, { data: targetsData }] = await Promise.all([
        api.get(`/admin/phishing/campaigns/${id}/stats`),
        api.get(`/admin/phishing/campaigns/${id}/targets`).catch(() => ({ data: null })),
      ]);
      setStats(data);
      setTargetReport(targetsData);
    } catch { }
  }

  const STATUS_LABEL = { reported: 'Reportó', clicked: 'Dio clic', ignored: 'Sin acción' };
  const STATUS_COLOR = { reported: 'bg-green-100 text-green-700', clicked: 'bg-red-100 text-red-700', ignored: 'bg-gray-100 text-gray-600' };

  async function deleteTemplate(id) {
    if (!confirm('¿Desactivar esta plantilla?')) return;
    try {
      await api.delete(`/admin/phishing/templates/${id}`);
      loadData();
    } catch { }
  }

  const tabs = [
    { id: 'overview', label: 'Descripción general' },
    { id: 'campaigns', label: 'Campañas' },
    { id: 'templates', label: 'Plantillas de phishing' },
    { id: 'corporate-pages', label: 'Páginas de destino' },
    { id: 'domains', label: 'Dominios' },
    { id: 'results', label: 'Informes' },
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
          {tab === 'corporate-pages' && (
            <button onClick={() => setShowNewCorporatePage(true)} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
              + Nueva página
            </button>
          )}
          {tab === 'domains' && (
            <button onClick={() => setShowNewDomain(true)} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
              + Nuevo dominio
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

      {/* OVERVIEW TAB */}
      {tab === 'overview' && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-title font-bold" style={{ color: '#001B71' }}>Últimas cinco campañas de phishing</h3>
            <p className="text-xs text-gray-400 mb-4">Porcentaje de destinatarios que dieron clic (Phish-prone), por campaña.</p>
            {overview.recent_campaigns.length === 0 ? (
              <p className="text-gray-400 text-center py-12">Aún no hay campañas enviadas.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, overview.recent_campaigns.length * 70)}>
                <BarChart data={overview.recent_campaigns} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }}
                    tickFormatter={(name) => {
                      const c = overview.recent_campaigns.find(x => x.name === name);
                      return c ? `${c.theme}` : name;
                    }} />
                  <Tooltip formatter={(v) => [`${v}%`, 'Phish-prone']} labelFormatter={(name) => {
                    const c = overview.recent_campaigns.find(x => x.name === name);
                    return c ? `${c.name} — ${c.group_label}` : name;
                  }} />
                  <Bar dataKey="phish_prone_pct" fill="#2B5597" radius={[0, 4, 4, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-fit">
            <h3 className="font-title font-bold mb-4" style={{ color: '#001B71' }}>Todas las campañas</h3>
            <div className="space-y-4">
              <OverviewRow label="Total de campañas" value={overview.total_campaigns} />
              <OverviewRow label="Campañas activas" value={overview.active_campaigns} />
              <OverviewRow label="Campañas inactivas" value={overview.inactive_campaigns} />
              <OverviewRow label="Pruebas de seguridad contra el phishing" value={overview.sent_tests} />
            </div>
          </div>
        </div>
      )}
      {tab === 'overview' && !overview && (
        <p className="text-gray-400 text-center py-12">Cargando descripción general...</p>
      )}

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
                  {c.corporate_page_name && (
                    <p className="text-xs mt-1">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">Ingeniería social pasiva: {c.corporate_page_name}</span>
                    </p>
                  )}
                  {c.sent_at && <p className="text-xs text-gray-400">Enviada: {new Date(c.sent_at).toLocaleDateString('es-GT')}</p>}
                  {c.event_count > 0 && <p className="text-xs text-gray-500 mt-1">{c.event_count} eventos · {c.click_count} clicks</p>}
                </div>
                <div className="flex items-center gap-2">
                  {c.status === 'draft' && (
                    <>
                      <button onClick={() => renderPreview(c.template_id, c.corporate_page_id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                        Vista previa
                      </button>
                      <button onClick={() => sendTest(c.id)} disabled={sendingTest === c.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                        {sendingTest === c.id ? 'Enviando...' : 'Enviar prueba'}
                      </button>
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
                <button onClick={() => { setStats(null); setTargetReport(null); }} className="text-gray-400 hover:text-gray-600">{'\u2715'}</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Destinatarios" value={stats.total_recipients} />
                <StatCard label="Abiertos" value={stats.events?.opened || 0} color="#2B5597" />
                <StatCard label="Clicks" value={stats.events?.clicked || 0} color="#e74c3c" />
                <StatCard label="Reportados" value={stats.events?.reported || 0} color="#00BC70" />
              </div>

              {targetReport && targetReport.targets?.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-600 mb-3">Detalle por destinatario</h4>
                  <div className="max-h-80 overflow-auto border border-gray-100 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50"><tr className="text-left text-xs text-gray-400">
                        <th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Correo</th><th className="px-3 py-2">Estado</th>
                      </tr></thead>
                      <tbody>
                        {targetReport.targets.map(tg => (
                          <tr key={tg.user_id} className="border-t border-gray-50">
                            <td className="px-3 py-2">{tg.display_name}</td>
                            <td className="px-3 py-2 text-gray-500">{tg.email}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[tg.status]}`}>{STATUS_LABEL[tg.status]}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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

      {/* CORPORATE PAGES TAB */}
      {tab === 'corporate-pages' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Apps corporativas reales y su variante "look-alike" usada en campañas de ingeniería social pasiva.
            Al crear una campaña con una de estas páginas, el enlace mostrado usa la URL look-alike y, al dar clic,
            se muestra una pantalla de precaución (en vez de la landing educativa clásica).
          </p>
          {corporatePages.length === 0 && <p className="text-gray-400 text-center py-8">No hay páginas corporativas registradas.</p>}
          {corporatePages.map(p => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
              <div>
                <p className="font-medium" style={{ color: '#001B71' }}>{p.name}</p>
                <p className="text-xs text-gray-400 mt-1">Real: {p.real_url}</p>
                <p className="text-xs text-gray-400">Look-alike: {p.lookalike_url}</p>
              </div>
              <button onClick={() => deleteCorporatePage(p.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50">
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* DOMAINS TAB */}
      {tab === 'domains' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Registro informativo de dominios usados o autorizados en campañas de phishing simulado (dominios de envío,
            dominios look-alike, etc.). Es solo un listado de referencia para el equipo de seguridad.
          </p>
          {domains.length === 0 && <p className="text-gray-400 text-center py-8">No hay dominios registrados.</p>}
          {domains.map(d => (
            <div key={d.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
              <div>
                <p className="font-medium" style={{ color: '#001B71' }}>{d.domain}</p>
                {d.notes && <p className="text-xs text-gray-400 mt-1">{d.notes}</p>}
              </div>
              <button onClick={() => deleteDomain(d.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50">
                Eliminar
              </button>
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
              <p className="text-xs text-gray-400 mt-1">Use {'{{trackingUrl}}'}, {'{{displayName}}'}, {'{{email}}'}, {'{{firstName}}'}, {'{{lookalikeUrl}}'} (solo si la campaña usa una página corporativa)</p>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Ingeniería social pasiva (opcional)</label>
              <select value={campaignForm.corporate_page_id} onChange={e => setCampaignForm({ ...campaignForm, corporate_page_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Ninguna (campaña clásica de phishing)</option>
                {corporatePages.map(p => <option key={p.id} value={p.id}>{p.name} ({p.lookalike_url})</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Si selecciona una página, use {'{{lookalikeUrl}}'} en el texto del enlace de la plantilla. Al dar clic, se mostrará
                la pantalla de precaución en vez de la landing educativa, y no se le mostrará al usuario quién más reportó, dio clic o ignoró.
              </p>
              <button type="button" onClick={() => renderPreview(campaignForm.template_id, campaignForm.corporate_page_id)}
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                👁 Vista previa del correo
              </button>
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

      {/* MODAL: Nueva Página Corporativa */}
      {showNewCorporatePage && (
        <Modal title="Nueva página corporativa" onClose={() => setShowNewCorporatePage(false)}>
          <form onSubmit={createCorporatePage} className="space-y-4">
            <Input label="Nombre" value={corporatePageForm.name} onChange={v => setCorporatePageForm({ ...corporatePageForm, name: v })} placeholder="ej: Correo corporativo" required />
            <Input label="URL real" value={corporatePageForm.real_url} onChange={v => setCorporatePageForm({ ...corporatePageForm, real_url: v })} placeholder="https://mail.agroamerica.com" required />
            <Input label="URL look-alike (usada en el correo de prueba)" value={corporatePageForm.lookalike_url} onChange={v => setCorporatePageForm({ ...corporatePageForm, lookalike_url: v })} placeholder="https://mail-agroamerica.com" required />
            <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Crear página</button>
          </form>
        </Modal>
      )}

      {/* MODAL: Nuevo Dominio */}
      {showNewDomain && (
        <Modal title="Nuevo dominio" onClose={() => setShowNewDomain(false)}>
          <form onSubmit={createDomain} className="space-y-4">
            <Input label="Dominio" value={domainForm.domain} onChange={v => setDomainForm({ ...domainForm, domain: v })} placeholder="agroamerica-seguridad.com" required />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
              <textarea value={domainForm.notes} onChange={e => setDomainForm({ ...domainForm, notes: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm h-16" placeholder="ej: dominio de envío para campañas Q1" />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>Registrar dominio</button>
          </form>
        </Modal>
      )}

      {/* MODAL: Vista previa del correo */}
      {previewHtml !== null && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setPreviewHtml(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Vista previa del correo</h3>
              <button onClick={() => setPreviewHtml(null)} className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Datos de muestra (Juan Pérez) — nada se envía. El enlace de esta vista previa no funciona ni se rastrea.
            </p>
            <iframe title="Vista previa del correo" srcDoc={previewHtml} sandbox=""
              className="w-full h-96 border border-gray-200 rounded-lg bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-xl font-bold" style={{ color: '#001B71' }}>{value}</p>
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
