import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function Provisioning() {
  const [ous, setOUs] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/org-units').then(r => setOUs(r.data.data || [])).catch(() => { });
    loadHistory();
  }, []);

  function loadHistory() {
    api.get('/admin/sync/history').then(r => setHistory(r.data.data || [])).catch(() => { });
  }

  async function dryRun() {
    setBusy(true);
    try {
      const { data } = await api.post('/admin/sync/ad?dryRun=true');
      alert(`Dry Run: ${data.stats?.users?.created || 0} nuevos, ${data.stats?.users?.deactivated || 0} desactivados, ${data.stats?.orgUnits?.created || 0} OUs nuevas`);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    setBusy(false);
  }

  async function syncNow() {
    if (!confirm('¿Ejecutar sincronización real con Active Directory?')) return;
    setBusy(true);
    try {
      const { data } = await api.post('/admin/sync/ad');
      alert(`Sync completado en ${data.duration_ms}ms:\n• ${data.stats?.users?.created || 0} creados\n• ${data.stats?.users?.deactivated || 0} desactivados`);
      loadHistory();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="font-title font-bold" style={{ color: '#001B71' }}>Sincronización con Active Directory</h3>
        <p className="text-sm text-gray-600">
          Dominio: <code className="bg-gray-100 px-2 py-0.5 rounded">CORPORATIVOAGROAMERICA.CORP</code>
        </p>
        <div className="flex gap-3">
          <button onClick={dryRun} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            Simular sync (dry run)
          </button>
          <button onClick={syncNow} disabled={busy} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: '#001B71' }}>
            Sincronizar ahora
          </button>
        </div>
        <p className="text-xs text-gray-400">OUs disponibles: {ous.length}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-title font-bold mb-3" style={{ color: '#001B71' }}>Historial de sincronizaciones</h3>
        <div className="space-y-2 max-h-80 overflow-auto">
          {history.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Sin sincronizaciones registradas todavía.</p>}
          {history.map(h => {
            let details = {};
            try { details = JSON.parse(h.details_json || '{}'); } catch { }
            return (
              <div key={h.id} className="flex justify-between items-center p-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium" style={{ color: '#001B71' }}>{h.action === 'ad_sync_dry_run' ? 'Simulación' : 'Sincronización real'}</p>
                  <p className="text-xs text-gray-400">{details.stats?.users?.created || 0} creados · {details.stats?.users?.deactivated || 0} desactivados</p>
                </div>
                <p className="text-xs text-gray-400">{new Date(h.created_at).toLocaleString('es-GT')}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
