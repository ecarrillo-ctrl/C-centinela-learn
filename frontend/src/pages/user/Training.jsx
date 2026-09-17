import { useState, useEffect } from 'react';
import api from '../../lib/api';
import CourseViewer from '../../components/CourseViewer';

export default function Training() {
  const [paths, setPaths] = useState([]);
  const [viewing, setViewing] = useState(null);

  useEffect(() => { api.get('/library/learning-paths').then(r => setPaths(r.data.data || [])).catch(() => {}); }, []);

  if (viewing) return <CourseViewer course={viewing} onClose={() => { setViewing(null); }} />;

  return (
    <div className="space-y-6">
      <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Capacitacion</h1>
      {paths.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400">No hay rutas de aprendizaje disponibles.</div>
      ) : (
        paths.map(p => (
          <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>{p.name}</h2>
                <p className="text-gray-500 text-sm">{p.description}</p>
              </div>
              {p.all_completed && (
                <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#00BC70' }}>
                  Completado {'\u{1F389}'}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {(p.courses || []).map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-50 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setViewing(c)}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{c.type === 'scorm' ? '\u{1F4E6}' : c.type === 'video_upload' || c.type === 'video_embed' ? '\u{25B6}' : '\u{1F4C4}'}</span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#001B71' }}>{c.title}</p>
                      <p className="text-xs text-gray-400">{c.type} &middot; {c.level}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    c.enrollment_status === 'completed' ? 'bg-green-100 text-green-700'
                    : c.enrollment_status === 'in_progress' ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-500'
                  }`}>
                    {c.enrollment_status === 'completed' ? 'Completado' : c.enrollment_status === 'in_progress' ? 'En progreso' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
