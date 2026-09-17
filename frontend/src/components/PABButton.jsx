import { useState } from 'react';
import api from '../lib/api';

export default function PABButton() {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!subject.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/pab/report', { reported_subject: subject });
      setResult(data);
    } catch { setResult({ message: 'Error al reportar' }); }
    setLoading(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="px-3 py-1 rounded-lg text-xs font-bold transition-colors"
        style={{ backgroundColor: '#00BC70', color: '#001B71' }}>
        Reportar correo
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-title text-xl font-bold mb-2" style={{ color: '#001B71' }}>Phish Alert Button</h2>
            <p className="text-gray-600 text-sm mb-4">Reporte un correo sospechoso. El equipo de seguridad lo analizara.</p>
            {result ? (
              <div className={`p-4 rounded-lg text-center ${result.was_simulated ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800'}`}>
                <p className="font-bold text-lg">{result.was_simulated ? '\u{1F389} \u00A1Excelente!' : '\u2705'}</p>
                <p>{result.message}</p>
                <button onClick={() => { setOpen(false); setResult(null); setSubject(''); }} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: '#001B71', color: 'white' }}>Cerrar</button>
              </div>
            ) : (
              <>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asunto del correo sospechoso"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-500">Cancelar</button>
                  <button onClick={submit} disabled={loading || !subject.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: '#00BC70' }}>
                    {loading ? 'Enviando...' : 'Reportar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
