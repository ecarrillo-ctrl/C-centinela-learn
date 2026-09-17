import { useState } from 'react';
import api from '../../../lib/api';

const EXPECTED_COLUMNS = ['email', 'display_name', 'first_name', 'last_name', 'department', 'job_title'];

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.some(f => f.trim() !== '')) rows.push(row); }

  return rows;
}

export default function Import() {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCSV(String(reader.result || ''));
      if (parsed.length === 0) return;
      const hdrs = parsed[0].map(h => h.trim());
      setHeaders(hdrs);
      setRows(parsed.slice(1));

      // Auto-mapea columnas cuyo nombre coincide (case-insensitive) con las esperadas
      const auto = {};
      for (const col of EXPECTED_COLUMNS) {
        const idx = hdrs.findIndex(h => h.toLowerCase().replace(/\s+/g, '_') === col);
        if (idx >= 0) auto[col] = idx;
      }
      setMapping(auto);
    };
    reader.readAsText(file);
  }

  async function doImport() {
    if (mapping.email === undefined) { alert('Debe mapear la columna de correo electrónico'); return; }
    setBusy(true);
    try {
      const payload = rows.map(r => ({
        email: r[mapping.email] || '',
        display_name: mapping.display_name !== undefined ? r[mapping.display_name] : '',
        first_name: mapping.first_name !== undefined ? r[mapping.first_name] : '',
        last_name: mapping.last_name !== undefined ? r[mapping.last_name] : '',
        department: mapping.department !== undefined ? r[mapping.department] : '',
        job_title: mapping.job_title !== undefined ? r[mapping.job_title] : '',
      }));
      const { data } = await api.post('/admin/users/import', { rows: payload });
      setResult(data);
    } catch (err) { alert(err.response?.data?.error || 'Error al importar'); }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="font-title font-bold" style={{ color: '#001B71' }}>Importar usuarios desde CSV</h3>
        <p className="text-sm text-gray-600">
          La primera fila debe contener los encabezados. Solo <strong>correo</strong> es obligatorio; el resto de columnas son opcionales.
          Si el correo ya existe, se actualizan sus datos; si no existe, se crea un usuario nuevo activo.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} className="text-sm" />
        {fileName && <p className="text-xs text-gray-400">Archivo: {fileName} · {rows.length} filas detectadas</p>}
      </div>

      {headers.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h4 className="font-medium text-sm" style={{ color: '#001B71' }}>Mapeo de columnas</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {EXPECTED_COLUMNS.map(col => (
              <div key={col}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {col === 'email' ? 'Correo (requerido)' : col}
                </label>
                <select value={mapping[col] ?? ''} onChange={e => setMapping({ ...mapping, [col]: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm">
                  <option value="">— No mapear —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="overflow-auto max-h-64 border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0"><tr>{headers.map((h, i) => <th key={i} className="text-left p-2">{h}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t border-gray-50">{r.map((c, j) => <td key={j} className="p-2 text-gray-500">{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && <p className="text-xs text-gray-400 p-2">... y {rows.length - 10} filas más</p>}
          </div>

          <button onClick={doImport} disabled={busy} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: '#001B71' }}>
            {busy ? 'Importando...' : `Importar ${rows.length} usuarios`}
          </button>
        </div>
      )}

      {result && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-2">
          <h4 className="font-medium text-sm" style={{ color: '#001B71' }}>Resultado de la importación</h4>
          <p className="text-sm text-gray-600">
            {result.created} creados · {result.updated} actualizados · {result.skipped} omitidos de {result.total} filas
          </p>
          {result.errors?.length > 0 && (
            <div className="text-xs text-red-500 space-y-1 max-h-40 overflow-auto">
              {result.errors.map((e, i) => <p key={i}>Fila {e.row}: {e.reason}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
