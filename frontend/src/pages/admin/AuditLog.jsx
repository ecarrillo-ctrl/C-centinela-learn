import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api';

export default function AuditLog() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ action: '', from: '', to: '', limit: 50 });

  const load = () => {
    const params = new URLSearchParams({ limit: filters.limit, offset: page * filters.limit });
    if (filters.action) params.set('action', filters.action);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    api.get(`/admin/audit-log?${params}`).then(r => { setLogs(r.data.data || []); setTotal(r.data.total || 0); }).catch(() => {});
  };

  useEffect(() => { load(); }, [page, filters]);

  const exportCsv = () => {
    const headers = 'Fecha,Actor,Accion,Entidad,IP,Detalle\n';
    const rows = logs.map(l => `"${l.created_at}","${l.actor_name || '—'}","${l.action}","${l.entity_type || ''} ${l.entity_id || ''}","${l.ip || ''}","${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const actions = ['ad_sync', 'login', 'content_upload', 'phishing_campaign_create', 'phishing_campaign_send', 'settings_update', 'user_promote_admin', 'user_demote_admin', 'user_archive'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>{t('nav.auditLog')} ({total})</h1>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: '#2B5597' }}>{t('common.exportCsv')}</button>
          <a href="/api/admin/analytics/report" target="_blank" className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: '#001B71' }}>{t('common.exportPdf')}</a>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={filters.action} onChange={e => { setFilters({...filters, action: e.target.value}); setPage(0); }}
          className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Todas las acciones</option>
          {actions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={e => { setFilters({...filters, from: e.target.value}); setPage(0); }}
          className="border rounded-lg px-3 py-2 text-sm" placeholder="Desde" />
        <input type="date" value={filters.to} onChange={e => { setFilters({...filters, to: e.target.value}); setPage(0); }}
          className="border rounded-lg px-3 py-2 text-sm" placeholder="Hasta" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: '#001B71' }} className="text-white">
            <tr>
              <th className="text-left p-3">Fecha</th>
              <th className="text-left p-3">Actor</th>
              <th className="text-left p-3">Accion</th>
              <th className="text-left p-3">Entidad</th>
              <th className="text-left p-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">{t('common.noData')}</td></tr>
            ) : logs.map(l => (
              <tr key={l.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="p-3 text-xs text-gray-500">{new Date(l.created_at).toLocaleString('es-GT')}</td>
                <td className="p-3 text-xs font-medium" style={{ color: '#001B71' }}>{l.actor_name || 'Sistema'}</td>
                <td className="p-3 text-xs">
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: l.action?.includes('error') ? '#fde8e8' : '#e8f5e9', color: l.action?.includes('error') ? '#c62828' : '#2e7d32' }}>
                    {l.action?.replace(/_/g, ' ') || '—'}
                  </span>
                </td>
                <td className="p-3 text-xs text-gray-500">{l.entity_type || '—'} {l.entity_id ? l.entity_id.substring(0, 8) + '...' : ''}</td>
                <td className="p-3 text-xs text-gray-400">{l.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > filters.limit && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 rounded text-sm border">{'<'}</button>
          <span className="px-3 py-1 text-sm text-gray-500">Pag. {page + 1} / {Math.ceil(total / filters.limit)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * filters.limit >= total} className="px-3 py-1 rounded text-sm border">{'>'}</button>
        </div>
      )}
    </div>
  );
}
