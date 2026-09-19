import { useState, useEffect } from 'react';
import api from '../../lib/api';
import BadgeIcon from '../../components/BadgeIcon';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
}

export default function Badges() {
  const [badges, setBadges] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Primero se revisan las pendientes (por si ya cumplía criterios antes de que existieran las insignias)
    // y luego se carga la lista completa.
    api.post('/library/check-badges').catch(() => { })
      .then(() => api.get('/library/badges'))
      .then(r => setBadges(r.data.data || []))
      .catch(() => { })
      .finally(() => setLoaded(true));
  }, []);

  const earned = badges.filter(b => b.earned);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="font-title text-3xl font-bold" style={{ color: '#1f2937' }}>Sus logros</h1>
        <p className="text-sm text-gray-600 mt-3 max-w-xl mx-auto">
          {earned.length > 0
            ? `¡Buen trabajo, héroe cibernético! Ganó ${earned.length} insignia${earned.length !== 1 ? 's' : ''}. Verifique sus logros heroicos a continuación y averigüe cómo puede obtener más insignias.`
            : 'Aún no ha ganado insignias. Complete capacitaciones y reporte correos sospechosos para obtener las primeras; abajo puede ver cómo conseguir cada una.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {badges.map(b => (
          <div key={b.id} className={`bg-white rounded-lg shadow-md overflow-hidden flex flex-col ${b.earned ? '' : 'opacity-90'}`}>
            <div className="px-6 pt-6 pb-5 text-center flex-1">
              <div className="flex justify-center mb-4">
                <BadgeIcon name={b.icon_url} locked={!b.earned} />
              </div>
              <h3 className="font-bold text-lg" style={{ color: b.earned ? '#1f2937' : '#9ca3af' }}>{b.name}</h3>
              <p className="text-sm mt-1 leading-snug" style={{ color: b.earned ? '#4b5563' : '#9ca3af' }}>
                {b.earned ? b.description : (b.hint || b.description)}
              </p>
            </div>
            <div className="border-t border-dashed border-gray-300 py-3 text-center text-sm"
              style={{ backgroundColor: b.earned ? '#FFE8DE' : '#F3F4F6', color: b.earned ? '#4b5563' : '#9ca3af' }}>
              {b.earned ? `Obtenida el ${fmtDate(b.earned_at)}` : 'Aún no obtenida'}
            </div>
          </div>
        ))}
        {loaded && badges.length === 0 && <p className="text-gray-400 col-span-full text-center py-8">No hay insignias disponibles.</p>}
      </div>
    </div>
  );
}
