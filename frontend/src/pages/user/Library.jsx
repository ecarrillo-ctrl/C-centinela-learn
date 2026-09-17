import { useState, useEffect } from 'react';
import api from '../../lib/api';
import CourseViewer from '../../components/CourseViewer';

export default function Library() {
  const [courses, setCourses] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    api.get('/admin/content').then(r => setCourses(r.data.data || [])).catch(() => {});
    api.get('/library/catalog').then(r => setCatalog(r.data.data || [])).catch(() => {});
  }, []);

  if (viewing) return <CourseViewer course={viewing} onClose={() => setViewing(null)} />;

  return (
    <div className="space-y-6">
      <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Biblioteca</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>Material disponible</h2>
        {courses.length === 0 ? (
          <p className="text-gray-400 text-sm">No hay material disponible.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {courses.map(c => (
              <div key={c.id} onClick={() => setViewing(c)}
                className="p-4 rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{c.type === 'scorm' ? '\u{1F4E6}' : c.type?.includes('video') ? '\u{1F3AC}' : '\u{1F4C4}'}</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#001B71' }}>{c.title}</p>
                    <p className="text-xs text-gray-400">{c.level} &middot; {c.type}</p>
                    {c.source_license && <p className="text-xs text-gray-400 truncate max-w-xs">{c.source_license}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {catalog.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>Catalogo publico</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {catalog.map(item => (
              <div key={item.id} className="p-4 rounded-lg border border-gray-100">
                <p className="text-sm font-medium" style={{ color: '#001B71' }}>{item.title}</p>
                <p className="text-xs text-gray-400 mt-1">{item.source}</p>
                <p className="text-xs mt-1" style={{ color: '#00BC70' }}>{item.license}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
