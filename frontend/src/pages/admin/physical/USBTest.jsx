import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function AdminPhysicalUSB() {
  const [tests, setTests] = useState([]);
  const [ous, setOUs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', location: '', org_unit_scope: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [t, o] = await Promise.all([
        api.get('/admin/physical-tests?type=usb'),
        api.get('/admin/org-units').catch(() => ({ data: { data: [] } })),
      ]);
      setTests(t.data.data || []);
      setOUs(o.data.data || []);
    } catch { }
    setLoading(false);
  }

  async function createTest(e) {
    e.preventDefault();
    try {
      await api.post('/admin/physical-tests', { ...form, test_type: 'usb' });
      setShowNew(false);
      setForm({ name: '', description: '', location: '', org_unit_scope: '' });
      loadData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function viewDetail(test) {
    setSelectedTest(test);
    try {
      const { data } = await api.get(`/admin/physical-tests/${test.id || test.ID}`);
      setDetail(data);
    } catch { }
  }

  async function completeTest(id) {
    if (!confirm('¿Finalizar esta prueba? Ya no registrará eventos nuevos.')) return;
    try {
      await api.put(`/admin/physical-tests/${id}/complete`);
      loadData();
      setSelectedTest(null);
      setDetail(null);
    } catch { }
  }

  async function deleteTest(id) {
    if (!confirm('¿Eliminar esta prueba y todos sus eventos?')) return;
    try {
      await api.delete(`/admin/physical-tests/${id}`);
      loadData();
      setSelectedTest(null);
      setDetail(null);
    } catch { }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Prueba de USB</h1>
          <p className="text-sm text-gray-500 mt-1">
            Distribuya dispositivos USB preparados y monitoree quién los conecta.
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: '#001B71' }}>
          + Nueva prueba USB
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Pruebas activas" value={tests.filter(t => (t.status || t.STATUS) === 'active').length} color="#001B71" />
        <StatCard label="Total eventos" value={tests.reduce((s, t) => s + parseInt(t.event_count || t.EVENT_COUNT || 0), 0)} color="#e74c3c" />
        <StatCard label="Usuarios únicos" value={tests.reduce((s, t) => s + parseInt(t.unique_users || t.UNIQUE_USERS || 0), 0)} color="#f39c12" />
      </div>

      {/* Test list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          {tests.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-4xl mb-2">{'\u{1F4BE}'}</p>
              <p>No hay pruebas USB creadas.</p>
            </div>
          )}
          {tests.map(t => {
            const id = t.id || t.ID;
            const status = t.status || t.STATUS;
            return (
              <div key={id} onClick={() => viewDetail(t)}
                className={`bg-white rounded-xl shadow-sm border p-4 cursor-pointer transition-colors ${selectedTest?.id === id || selectedTest?.ID === id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                  }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm" style={{ color: '#001B71' }}>{t.name || t.NAME}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t.location || t.LOCATION || 'Sin ubicación'} · Código: <code className="bg-gray-100 px-1 rounded">{t.tracking_code || t.TRACKING_CODE}</code>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>{status === 'active' ? 'Activa' : 'Finalizada'}</span>
                    <p className="text-xs text-gray-400 mt-1">{t.event_count || t.EVENT_COUNT || 0} eventos</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {detail && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-title font-bold mb-3" style={{ color: '#001B71' }}>
              {detail.test?.name || detail.test?.NAME}
            </h3>
            <p className="text-xs text-gray-400 mb-1">
              Código: <code className="bg-gray-100 px-1 rounded">{detail.test?.tracking_code || detail.test?.TRACKING_CODE}</code>
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Ubicación: {detail.test?.location || detail.test?.LOCATION || '—'}
            </p>

            <div className="flex gap-2 mb-4">
              {(detail.test?.status || detail.test?.STATUS) === 'active' && (
                <button onClick={() => completeTest(detail.test?.id || detail.test?.ID)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-amber-500">
                  Finalizar
                </button>
              )}
              <button onClick={() => deleteTest(detail.test?.id || detail.test?.ID)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50">
                Eliminar
              </button>
            </div>

            <h4 className="text-sm font-bold mb-2" style={{ color: '#001B71' }}>Eventos ({detail.events?.length || 0})</h4>
            <div className="max-h-64 overflow-auto space-y-2">
              {(detail.events || []).map(ev => (
                <div key={ev.id || ev.ID} className="p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-red-600">{ev.event_type || ev.EVENT_TYPE}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(ev.created_at || ev.CREATED_AT).toLocaleString('es-GT')}
                    </span>
                  </div>
                  {(ev.display_name || ev.DISPLAY_NAME) && (
                    <p className="text-xs text-gray-600 mt-1">{ev.display_name || ev.DISPLAY_NAME} ({ev.email || ev.EMAIL})</p>
                  )}
                  <p className="text-xs text-gray-400">IP: {ev.ip || ev.IP || '—'}</p>
                </div>
              ))}
              {(!detail.events || detail.events.length === 0) && (
                <p className="text-xs text-gray-400 text-center py-4">Sin eventos registrados</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Nueva prueba */}
      {showNew && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Nueva prueba USB</h3>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-xl">{'\u2715'}</button>
            </div>
            <form onSubmit={createTest} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" required placeholder="ej: USB Lobby Corporativo Q3" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ej: Recepción Edificio A" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm h-16" placeholder="Instrucciones o notas..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">OU objetivo (opcional)</label>
                <select value={form.org_unit_scope} onChange={e => setForm({ ...form, org_unit_scope: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Todas las ubicaciones</option>
                  {ous.map(ou => <option key={ou.id || ou.ID} value={ou.id || ou.ID}>{ou.name || ou.NAME}</option>)}
                </select>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs text-amber-700">
                  El USB contendrá un archivo que al ejecutarse, enviará un beacon al servidor con el código de tracking.
                  Se generará un código único automáticamente.
                </p>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
                Crear prueba
              </button>
            </form>
          </div>
        </div>
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
