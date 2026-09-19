import { useState, useEffect } from 'react';
import api from '../../../lib/api';
import BadgeIcon, { BADGE_ICON_KEYS } from '../../../components/BadgeIcon';

// Criterios que el sistema sabe evaluar solo con datos reales de la plataforma.
const CRITERIA = [
  { type: 'courses_completed', label: 'Completar N capacitaciones', fields: [{ key: 'min', label: 'Capacitaciones', def: 1 }] },
  { type: 'first_attempt_pass', label: 'Aprobar un examen en el primer intento', fields: [] },
  { type: 'courses_in_window', label: 'Completar N capacitaciones en un lapso de horas', fields: [{ key: 'count', label: 'Capacitaciones', def: 3 }, { key: 'hours', label: 'Horas', def: 24 }] },
  { type: 'completed_hour_range', label: 'Completar una capacitación en cierto horario (hora de Guatemala)', fields: [{ key: 'from', label: 'Desde (hora 0-23)', def: 5 }, { key: 'to', label: 'Hasta (hora 0-23, sin incluir)', def: 8 }] },
  { type: 'all_courses_completed', label: 'Completar todas las capacitaciones asignadas', fields: [] },
  { type: 'learning_path', label: 'Completar una ruta de aprendizaje', fields: [], pathSelect: true },
  { type: 'first_login', label: 'Ingresar a la plataforma por primera vez', fields: [] },
  { type: 'diploma_downloaded', label: 'Descargar un diploma', fields: [] },
  { type: 'pab_count', label: 'Reportar N correos sospechosos con el PAB', fields: [{ key: 'min', label: 'Reportes', def: 1 }] },
  { type: 'reported_simulated', label: 'Reportar un phishing simulado', fields: [] },
  { type: 'zero_clicks', label: 'No haber dado clic en ningún phishing simulado', fields: [] },
  { type: 'no_clicks_min_campaigns', label: 'Recibir N campañas de phishing sin dar clic en ninguna', fields: [{ key: 'min', label: 'Campañas', def: 3 }] },
];

function describe(criteria, paths) {
  const def = CRITERIA.find(c => c.type === criteria?.type);
  if (!def) return 'Criterio no reconocido';
  let text = def.label;
  if (def.fields.length) {
    const vals = def.fields.map(f => `${f.label.split(' (')[0].toLowerCase()}: ${criteria[f.key] ?? f.def}`).join(', ');
    text += ` — ${vals}`;
  }
  if (def.pathSelect) {
    const p = paths.find(x => x.id === criteria.path_id);
    text += ` — ${p ? p.name : 'ruta no seleccionada'}`;
  }
  return text;
}

const EMPTY_FORM = { name: '', description: '', hint: '', icon: 'medal', customUrl: '', type: 'courses_completed', params: { min: 1 }, path_id: '' };

export default function BadgesAdmin() {
  const [badges, setBadges] = useState([]);
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = cerrado, 'new' o un id
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); api.get('/admin/learning-paths').then(r => setPaths(r.data.data || [])).catch(() => { }); }, []);

  function load() {
    setLoading(true);
    api.get('/admin/badges')
      .then(r => setBadges((r.data.data || []).map(b => {
        let criteria = {};
        try { criteria = JSON.parse(b.criteria_json || '{}'); } catch { /* sin criterio */ }
        return { ...b, criteria };
      })))
      .catch(() => { })
      .finally(() => setLoading(false));
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing('new');
  }

  function openEdit(b) {
    const def = CRITERIA.find(c => c.type === b.criteria.type) || CRITERIA[0];
    const isUrl = b.icon_url && /^(https?:)?\//.test(b.icon_url);
    const params = {};
    def.fields.forEach(f => { params[f.key] = b.criteria[f.key] ?? f.def; });
    setForm({
      name: b.name, description: b.description || '', hint: b.criteria.hint || '',
      icon: isUrl ? '' : (b.icon_url || 'medal'), customUrl: isUrl ? b.icon_url : '',
      type: def.type, params, path_id: b.criteria.path_id || '',
    });
    setEditing(b.id);
  }

  function changeType(type) {
    const def = CRITERIA.find(c => c.type === type);
    const params = {};
    def.fields.forEach(f => { params[f.key] = f.def; });
    setForm({ ...form, type, params, path_id: '' });
  }

  async function save(e) {
    e.preventDefault();
    const def = CRITERIA.find(c => c.type === form.type);
    if (def.pathSelect && !form.path_id) { alert('Seleccione la ruta de aprendizaje'); return; }

    const criteria = { type: form.type };
    def.fields.forEach(f => { criteria[f.key] = Number(form.params[f.key]); });
    if (def.pathSelect) criteria.path_id = form.path_id;
    if (form.hint.trim()) criteria.hint = form.hint.trim();

    const payload = {
      name: form.name, description: form.description,
      icon_url: form.customUrl.trim() || form.icon || null,
      criteria,
    };

    setSaving(true);
    try {
      if (editing === 'new') await api.post('/admin/badges', payload);
      else await api.put(`/admin/badges/${editing}`, payload);
      setEditing(null);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Error al guardar'); }
    setSaving(false);
  }

  async function remove(b) {
    const n = parseInt(b.earned_count || 0, 10);
    const warn = n > 0 ? ` La han ganado ${n} usuario(s) y la perderán.` : '';
    if (!confirm(`¿Eliminar la insignia "${b.name}"?${warn}`)) return;
    try { await api.delete(`/admin/badges/${b.id}`); load(); }
    catch (err) { alert(err.response?.data?.error || 'Error al eliminar'); }
  }

  const def = CRITERIA.find(c => c.type === form.type);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 max-w-2xl">
          Insignias que los usuarios ganan automáticamente al cumplir el criterio. Al crear o editar una, quienes ya
          cumplan el criterio la recibirán la próxima vez que abran "Logros" o completen una capacitación.
        </p>
        <button onClick={openNew} className="px-4 py-2 rounded-lg text-white text-sm font-medium whitespace-nowrap" style={{ backgroundColor: '#001B71' }}>
          + Nueva insignia
        </button>
      </div>

      {loading && <p className="text-center text-gray-400 py-8">Cargando...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {badges.map(b => (
          <div key={b.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex gap-4">
            <div className="shrink-0"><BadgeIcon name={b.icon_url} size={64} /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold" style={{ color: '#001B71' }}>{b.name}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{b.description}</p>
              <p className="text-xs text-gray-400 mt-2">{describe(b.criteria, paths)}</p>
              <p className="text-xs mt-1" style={{ color: '#00BC70' }}>{b.earned_count || 0} usuario(s) la han ganado</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => openEdit(b)} className="px-3 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Editar</button>
                <button onClick={() => remove(b)} className="px-3 py-1 rounded-lg text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50">Eliminar</button>
              </div>
            </div>
          </div>
        ))}
        {!loading && badges.length === 0 && <p className="text-gray-400 col-span-full text-center py-8">No hay insignias.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>{editing === 'new' ? 'Nueva insignia' : 'Editar insignia'}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
            </div>

            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={255}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ej: Madrugador" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje al ganarla</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm h-16" placeholder="¡Excelente! Ha ganado la insignia de..." />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cómo obtenerla (se muestra mientras no la haya ganado)</label>
                <input value={form.hint} onChange={e => setForm({ ...form, hint: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ej: Complete su primera capacitación." />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Ícono</label>
                <div className="flex flex-wrap gap-2">
                  {BADGE_ICON_KEYS.map(k => (
                    <button type="button" key={k} onClick={() => setForm({ ...form, icon: k, customUrl: '' })}
                      className={`p-1 rounded-lg border-2 ${form.icon === k && !form.customUrl ? 'border-[#001B71] bg-blue-50' : 'border-transparent hover:bg-gray-50'}`}>
                      <BadgeIcon name={k} size={44} />
                    </button>
                  ))}
                </div>
                <input value={form.customUrl} onChange={e => setForm({ ...form, customUrl: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-2" placeholder="…o pegue la URL de una imagen propia (opcional)" />
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Se otorga cuando el usuario…</label>
                  <select value={form.type} onChange={e => changeType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {CRITERIA.map(c => <option key={c.type} value={c.type}>{c.label}</option>)}
                  </select>
                </div>

                {def.fields.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {def.fields.map(f => (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                        <input type="number" min="0" max="999" required value={form.params[f.key] ?? ''}
                          onChange={e => setForm({ ...form, params: { ...form.params, [f.key]: e.target.value } })}
                          className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                    ))}
                  </div>
                )}

                {def.pathSelect && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ruta de aprendizaje</label>
                    <select value={form.path_id} onChange={e => setForm({ ...form, path_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                      <option value="">Seleccionar ruta...</option>
                      {paths.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: '#001B71' }}>
                {saving ? 'Guardando...' : editing === 'new' ? 'Crear insignia' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
