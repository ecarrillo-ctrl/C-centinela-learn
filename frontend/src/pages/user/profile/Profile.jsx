import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../lib/api';

export default function Profile() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user?.id) {
      api.get(`/admin/analytics/risk?scope=user&limit=1`).then(r => {
        const match = (r.data.data || []).find(u => u.id === user.id);
        if (match) setStats(match);
      }).catch(() => {});
    }
  }, [user?.id]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Perfil</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ backgroundColor: '#00BC70', color: '#001B71' }}>
            {user?.displayName?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <h2 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>{user?.displayName}</h2>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium mt-1 inline-block"
              style={{ backgroundColor: user?.isAdmin ? '#2B5597' : '#D1CCBD', color: user?.isAdmin ? 'white' : '#001B71' }}>
              {user?.isAdmin ? 'Administrador' : 'Colaborador'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400">Risk Score</p>
            <p className="text-xl font-bold" style={{ color: '#001B71' }}>{stats?.risk_score || '0'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Phish Prone</p>
            <p className="text-xl font-bold" style={{ color: stats?.phish_prone ? '#e74c3c' : '#00BC70' }}>{stats?.phish_prone ? 'Si' : 'No'}</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <p className="text-xs text-gray-400">Los datos personales provienen de Active Directory. Contacte al equipo de TI para actualizar su informacion.</p>
      </div>
    </div>
  );
}
