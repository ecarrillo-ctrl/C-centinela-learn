import { useState } from 'react';
import api from '../../../lib/api';

export default function Merge() {
  const [survivor, setSurvivor] = useState(null);
  const [loser, setLoser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Esta acción es irreversible.</strong> Todo el historial del usuario "a fusionar" (capacitaciones, resultados de
        phishing, insignias, reportes PAB, grupos, historial de riesgo) se traslada al usuario "a conservar", y el usuario
        "a fusionar" se elimina permanentemente.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UserPicker label="Usuario a conservar" color="#00BC70" selected={survivor} onSelect={setSurvivor} exclude={loser?.id} />
        <UserPicker label="Usuario a fusionar (será eliminado)" color="#e74c3c" selected={loser} onSelect={setLoser} exclude={survivor?.id} />
      </div>

      {survivor && loser && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Se conservará <strong style={{ color: '#001B71' }}>{survivor.display_name}</strong> ({survivor.email}) y se eliminará{' '}
            <strong style={{ color: '#001B71' }}>{loser.display_name}</strong> ({loser.email}), trasladando su historial al primero.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              if (!confirm(`¿Confirma fusionar "${loser.email}" dentro de "${survivor.email}"? Esta acción no se puede deshacer.`)) return;
              setBusy(true);
              setResult(null);
              try {
                await api.post('/admin/users/merge', { survivor_id: survivor.id, loser_id: loser.id });
                setResult({ ok: true });
                setSurvivor(null);
                setLoser(null);
              } catch (err) {
                setResult({ ok: false, error: err.response?.data?.error || 'Error al fusionar' });
              }
              setBusy(false);
            }}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: '#e74c3c' }}>
            {busy ? 'Fusionando...' : 'Fusionar usuarios'}
          </button>
        </div>
      )}

      {result?.ok && <p className="text-sm text-green-600">Usuarios fusionados correctamente.</p>}
      {result && !result.ok && <p className="text-sm text-red-500">{result.error}</p>}
    </div>
  );
}

function UserPicker({ label, color, selected, onSelect, exclude }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);

  async function doSearch(q) {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    try {
      const { data } = await api.get(`/admin/users?search=${encodeURIComponent(q)}&limit=10&status=`);
      setResults((data.data || []).filter(u => u.id !== exclude));
    } catch { setResults([]); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-2">
      <p className="text-sm font-medium" style={{ color }}>{label}</p>
      {selected ? (
        <div className="flex items-center justify-between p-2 rounded-lg border border-gray-100">
          <div>
            <p className="text-sm font-medium">{selected.display_name}</p>
            <p className="text-xs text-gray-400">{selected.email}</p>
          </div>
          <button onClick={() => onSelect(null)} className="text-xs text-gray-400 hover:text-gray-600">Cambiar</button>
        </div>
      ) : (
        <>
          <input value={search} onChange={e => doSearch(e.target.value)} placeholder="Buscar por nombre o correo..."
            className="w-full border rounded-lg px-3 py-2 text-sm" />
          <div className="max-h-48 overflow-auto space-y-1">
            {results.map(u => (
              <button key={u.id} type="button" onClick={() => { onSelect(u); setSearch(''); setResults([]); }}
                className="w-full text-left p-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                <p className="text-sm font-medium">{u.display_name}</p>
                <p className="text-xs text-gray-400">{u.email}</p>
              </button>
            ))}
            {search.length >= 2 && results.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Sin resultados</p>}
          </div>
        </>
      )}
    </div>
  );
}
