import { useState, useEffect } from 'react';
import api from '../../lib/api';

export default function Badges() {
  const [badges, setBadges] = useState([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => { api.get('/library/badges').then(r => setBadges(r.data.data || [])).catch(() => {}); }, []);

  const checkBadges = async () => {
    setChecking(true);
    try { await api.post('/library/check-badges'); api.get('/library/badges').then(r => setBadges(r.data.data || [])); }
    catch {}
    setChecking(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Insignias</h1>
        <button onClick={checkBadges} disabled={checking}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: '#2B5597' }}>
          {checking ? 'Verificando...' : 'Verificar insignias'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {badges.map(b => (
          <div key={b.id} className={`bg-white rounded-xl shadow-sm border p-5 text-center transition-all ${b.earned ? 'border-green-300' : 'border-gray-100 opacity-50'}`}>
            <div className="text-4xl mb-2">{b.earned ? '\u{1F3C5}' : '\u{1F512}'}</div>
            <h3 className="font-title font-bold text-sm" style={{ color: '#001B71' }}>{b.name}</h3>
            <p className="text-xs text-gray-400 mt-1">{b.description}</p>
            {b.earned && <p className="text-xs mt-2" style={{ color: '#00BC70' }}>Obtenida {new Date(b.earned_at).toLocaleDateString('es-GT')}</p>}
          </div>
        ))}
        {badges.length === 0 && <p className="text-gray-400 col-span-full text-center py-8">No hay insignias disponibles.</p>}
      </div>
    </div>
  );
}
