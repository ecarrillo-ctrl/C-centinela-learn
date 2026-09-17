import { useState } from 'react';

const PLACEHOLDERS = [
  { key: '{{user.first_name}}', desc: 'Nombre del usuario', example: 'Juan' },
  { key: '{{user.last_name}}', desc: 'Apellido del usuario', example: 'Pérez' },
  { key: '{{user.display_name}}', desc: 'Nombre completo', example: 'Juan Pérez' },
  { key: '{{user.email}}', desc: 'Correo electrónico', example: 'jperez@agroamerica.com' },
  { key: '{{user.department}}', desc: 'Departamento', example: 'Tecnología' },
  { key: '{{user.job_title}}', desc: 'Puesto de trabajo', example: 'Analista de Sistemas' },
  { key: '{{org.name}}', desc: 'Nombre de la organización', example: 'AgroAmérica' },
  { key: '{{org.unit}}', desc: 'Unidad organizacional', example: 'TI Guatemala' },
  { key: '{{campaign.name}}', desc: 'Nombre de la campaña', example: 'Phishing Q3 2026' },
  { key: '{{course.title}}', desc: 'Título del curso', example: 'Seguridad Básica' },
  { key: '{{due_date}}', desc: 'Fecha de vencimiento', example: '2026-08-15' },
  { key: '{{tracking_url}}', desc: 'URL de tracking (phishing)', example: 'https://track.empresa.com/...' },
  { key: '{{landing_url}}', desc: 'URL de página educativa', example: '/educacion' },
  { key: '{{program_owner.name}}', desc: 'Responsable del programa', example: 'Pilar de Ciberseguridad' },
  { key: '{{program_owner.email}}', desc: 'Correo del responsable', example: 'ciberseguridad@agroamerica.com' },
];

export default function Placeholders() {
  const [search, setSearch] = useState('');

  const filtered = PLACEHOLDERS.filter(p =>
    p.key.toLowerCase().includes(search.toLowerCase()) ||
    p.desc.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-title text-xl font-bold" style={{ color: '#001B71' }}>Marcadores de posición</h1>
        <p className="text-sm text-gray-500 mt-1">
          Variables disponibles para plantillas de correo, phishing y notificaciones.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar marcador..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4" />

        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 text-xs font-bold text-gray-500">Marcador</th>
                <th className="text-left p-3 text-xs font-bold text-gray-500">Descripción</th>
                <th className="text-left p-3 text-xs font-bold text-gray-500">Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.key} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="p-3">
                    <code className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-mono">{p.key}</code>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{p.desc}</td>
                  <td className="p-3 text-xs text-gray-400 italic">{p.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            <strong>Uso:</strong> Incluya estos marcadores en el cuerpo HTML de las plantillas de phishing o
            en las plantillas de correo de notificación. Se reemplazarán automáticamente con los datos reales
            de cada destinatario al momento del envío.
          </p>
        </div>
      </div>
    </div>
  );
}
