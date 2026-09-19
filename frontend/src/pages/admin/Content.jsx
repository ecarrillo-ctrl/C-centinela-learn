import { useState, useEffect } from 'react';
import api from '../../lib/api';
import CourseViewer from '../../components/CourseViewer';

export default function AdminContent() {
  const [courses, setCourses] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [showAIDesigner, setShowAIDesigner] = useState(false);
  const [aiForm, setAiForm] = useState({ topic: '', duration: '5 minutos', content_type: 'presentación interactiva' });
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [previewCourse, setPreviewCourse] = useState(null);
  const [upload, setUpload] = useState({ title: '', level: 'basico', description: '', file: null });
  const [linkForm, setLinkForm] = useState({ title: '', url: '', level: 'basico', description: '' });
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [showNewQuestion, setShowNewQuestion] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [qForm, setQForm] = useState({ question_text: '', options: [{ text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }] });

  useEffect(() => {
    api.get('/admin/content').then(r => setCourses(r.data.data || [])).catch(() => { });
    api.get('/library/catalog').then(r => setCatalog(r.data.data || [])).catch(() => { });
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('title', upload.title);
    fd.append('level', upload.level);
    fd.append('description', upload.description);
    fd.append('file', upload.file);
    try {
      await api.post('/admin/content/upload', fd);
      setUpload({ title: '', level: 'basico', description: '', file: null });
      api.get('/admin/content').then(r => setCourses(r.data.data || []));
    } catch (err) { alert(err.response?.data?.error || 'Error al subir'); }
  };

  const handleAddLink = async (e) => {
    e.preventDefault();
    try {
      const url = linkForm.url.trim();
      let externalId = url;
      // Auto-extract YouTube video ID from various URL formats
      const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) externalId = ytMatch[1];

      await api.post('/admin/content/embed', {
        title: linkForm.title,
        description: linkForm.description,
        level: linkForm.level,
        external_id: externalId,
        source_url: url,
        source_license: 'Recurso externo',
      });
      setLinkForm({ title: '', url: '', level: 'basico', description: '' });
      api.get('/admin/content').then(r => setCourses(r.data.data || []));
    } catch (err) { alert(err.response?.data?.error || 'Error al agregar enlace'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Retirar este contenido?')) return;
    try { await api.delete(`/admin/content/${id}`); setCourses(courses.filter(c => c.id !== id)); } catch { }
  };

  const handleImport = async (item) => {
    if (item.type === 'video_embed') {
      // El catálogo solo trae videos de ejemplo: el administrador indica el enlace real.
      const url = (prompt(`Pegue el enlace de YouTube o Vimeo para "${item.title}":`) || '').trim();
      if (!url) return;
      const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
      try {
        await api.post('/admin/content/embed', { title: item.title, description: item.description || '', level: item.level, external_id: yt ? yt[1] : url, source_url: url, source_license: item.license });
        window.location.reload();
      } catch (err) { alert(err.response?.data?.error || 'Error al importar'); }
      return;
    }
    try { await api.post('/library/catalog/import', { catalogId: item.id, title: item.title, level: item.level, type: item.type, source: item.source, sourceUrl: item.sourceUrl, license: item.license }); window.location.reload(); } catch { }
  };

  async function selectCourse(course) {
    setSelectedCourse(course);
    try {
      const { data } = await api.get(`/admin/courses/${course.id}/questions`);
      setQuestions(data.data || []);
    } catch { setQuestions([]); }
  }

  async function addQuestion(e) {
    e.preventDefault();
    if (!selectedCourse) return;
    const validOptions = qForm.options.filter(o => o.text.trim());
    if (validOptions.length < 2) { alert('Agregue al menos 2 opciones'); return; }
    if (!validOptions.some(o => o.correct)) { alert('Marque al menos una opción correcta'); return; }
    try {
      await api.post(`/admin/courses/${selectedCourse.id}/questions`, {
        question_text: qForm.question_text,
        question_type: 'multiple_choice',
        options: validOptions.map(o => ({ text: o.text, correct: o.correct })),
      });
      setShowNewQuestion(false);
      setQForm({ question_text: '', options: [{ text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }] });
      selectCourse(selectedCourse);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function deleteQuestion(qId) {
    if (!selectedCourse || !confirm('¿Eliminar esta pregunta?')) return;
    try {
      await api.delete(`/admin/courses/${selectedCourse.id}/questions/${qId}`);
      selectCourse(selectedCourse);
    } catch { }
  }

  return (
    <div className="space-y-6">
      {/* Preview mode */}
      {previewCourse && <CourseViewer course={previewCourse} onClose={() => setPreviewCourse(null)} />}

      <div className="flex items-center justify-between">
        <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>Contenido</h1>
        <button onClick={() => setShowAIDesigner(true)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2" style={{ backgroundColor: '#2B5597' }}>
          <span>{'\u{1F916}'}</span> Crear con IA
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload file */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>
            {'\u{1F4C1}'} Subir archivo
          </h2>
          <p className="text-xs text-gray-400 mb-3">PDF, video, presentación, imagen, audio, documento</p>
          <form onSubmit={handleUpload} className="space-y-3">
            <input value={upload.title} onChange={e => setUpload({ ...upload, title: e.target.value })}
              placeholder="Título del contenido" className="w-full border rounded-lg px-3 py-2 text-sm" required />
            <input value={upload.description} onChange={e => setUpload({ ...upload, description: e.target.value })}
              placeholder="Descripción breve (opcional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <select value={upload.level} onChange={e => setUpload({ ...upload, level: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="basico">Básico</option><option value="intermedio">Intermedio</option><option value="avanzado">Avanzado</option>
            </select>
            <input type="file" onChange={e => setUpload({ ...upload, file: e.target.files[0] })} className="w-full text-sm" required />
            <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
              Subir archivo
            </button>
          </form>
        </div>

        {/* Add link */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>
            {'\u{1F517}'} Agregar enlace
          </h2>
          <p className="text-xs text-gray-400 mb-3">YouTube, Vimeo, sitio web, recurso externo</p>
          <form onSubmit={handleAddLink} className="space-y-3">
            <input value={linkForm.title} onChange={e => setLinkForm({ ...linkForm, title: e.target.value })}
              placeholder="Título del contenido" className="w-full border rounded-lg px-3 py-2 text-sm" required />
            <input value={linkForm.url} onChange={e => setLinkForm({ ...linkForm, url: e.target.value })}
              placeholder="URL completa (ej: https://youtube.com/watch?v=...)" className="w-full border rounded-lg px-3 py-2 text-sm" required />
            <input value={linkForm.description} onChange={e => setLinkForm({ ...linkForm, description: e.target.value })}
              placeholder="Descripción breve (opcional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <select value={linkForm.level} onChange={e => setLinkForm({ ...linkForm, level: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="basico">Básico</option><option value="intermedio">Intermedio</option><option value="avanzado">Avanzado</option>
            </select>
            <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#2B5597' }}>
              Agregar enlace
            </button>
          </form>
        </div>
      </div>

      {/* Material actual */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>Material actual ({courses.length})</h2>
        <div className="space-y-2">
          {courses.map(c => (
            <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${selectedCourse?.id === c.id ? 'border-blue-300 bg-blue-50' : 'border-gray-50 hover:bg-gray-50'
              }`} onClick={() => selectCourse(c)}>
              <div className="flex items-center gap-3">
                <span className="text-lg">{c.course_type === 'scorm' ? '\u{1F4E6}' : c.course_type?.includes('video') ? '\u{1F3AC}' : '\u{1F4C4}'}</span>
                <div>
                  <p className="text-sm font-medium" style={{ color: '#001B71' }}>{c.title}</p>
                  <p className="text-xs text-gray-400">{c.course_type} · {c.level_type} {c.source_license ? `· ${c.source_license}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <span className="text-xs text-gray-400">{c.enrollment_count || 0} inscritos</span>
                <button onClick={() => setPreviewCourse(c)}
                  className="text-xs text-green-600 hover:text-green-800">Ver</button>
                <button onClick={() => setEditingCourse({ id: c.id, title: c.title, level: c.level_type, description: c.description || '', file: null, isVideoEmbed: c.course_type === 'video_embed', videoUrl: '' })}
                  className="text-xs text-blue-500 hover:text-blue-700">Editar</button>
                <button onClick={() => handleDelete(c.id)} className="text-xs text-red-500 hover:text-red-700">Retirar</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quiz panel para curso seleccionado */}
      {selectedCourse && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>
                {selectedCourse.title}
              </h2>
              <p className="text-xs text-gray-400">{questions.length} pregunta(s) · Tipo: {selectedCourse.course_type}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNewQuestion(true)}
                className="px-3 py-2 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: '#00BC70' }}>
                + Pregunta
              </button>
              <button onClick={async () => {
                const desc = selectedCourse.description || '';
                if (desc.length < 50) {
                  alert('Para generar preguntas con IA, el curso necesita una descripción detallada del contenido.\n\nAgregue la descripción en el campo de abajo y luego intente de nuevo.');
                  return;
                }
                if (!confirm(`¿Generar 5 preguntas basadas en el contenido del curso?\n\nContenido disponible: ${desc.length} caracteres`)) return;
                try {
                  const { data } = await api.post(`/admin/courses/${selectedCourse.id}/generate-quiz`, { numQuestions: 5, difficulty: 'medium', autoSave: true });
                  alert(data.message);
                  selectCourse(selectedCourse);
                } catch (err) { alert(err.response?.data?.error || 'Error al generar quiz con IA'); }
              }} className="px-3 py-2 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: '#2B5597' }}>
                Generar con IA
              </button>
            </div>
          </div>

          {/* Course description editor — this is what the AI reads */}
          <div className="mb-4 p-3 rounded-lg border border-blue-100 bg-blue-50/50">
            <label className="block text-xs font-bold text-blue-700 mb-1">
              Descripción del contenido (la IA usa este texto para generar preguntas)
            </label>
            <textarea
              defaultValue={selectedCourse.description || ''}
              onBlur={async (e) => {
                const newDesc = e.target.value;
                if (newDesc !== (selectedCourse.description || '')) {
                  try {
                    await api.put(`/admin/content/${selectedCourse.id}/description`, { description: newDesc });
                    setSelectedCourse({ ...selectedCourse, description: newDesc });
                  } catch { }
                }
              }}
              className="w-full border rounded-lg px-3 py-2 text-xs text-gray-700 h-20 resize-y"
              placeholder="Describa aquí el contenido del curso (qué muestra la imagen, qué dice el PDF, procedimientos, pasos, etc.). La IA generará preguntas basadas en este texto." />
            <p className="text-xs text-blue-500 mt-1">
              {(selectedCourse.description || '').length} caracteres · {(selectedCourse.description || '').length < 50 ? 'Agregue más detalle para que la IA genere mejores preguntas' : 'Contenido suficiente para generar quiz'}
            </p>
          </div>

          {questions.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p>Sin preguntas. Agregue manualmente o genere con IA.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={q.id} className="p-4 rounded-lg border border-gray-100">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-medium flex-1" style={{ color: '#001B71' }}>{i + 1}. {q.question_text}</p>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => {
                        const newText = prompt('Editar pregunta:', q.question_text);
                        if (newText && newText !== q.question_text) {
                          api.put(`/admin/courses/${selectedCourse.id}/questions/${q.id}`, { question_text: newText })
                            .then(() => selectCourse(selectedCourse)).catch(() => { });
                        }
                      }} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">Editar</button>
                      <button onClick={() => deleteQuestion(q.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-400 hover:bg-red-50">Eliminar</button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {(q.options || []).map(opt => (
                      <div key={opt.id} className={`text-xs px-2 py-1 rounded ${opt.is_correct === 1 ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-50 text-gray-500'}`}>
                        {opt.is_correct === 1 && '\u2713 '}{opt.option_text}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Catálogo público */}
      {catalog.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-title text-lg font-bold mb-4" style={{ color: '#001B71' }}>Catálogo público ({catalog.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {catalog.map(item => (
              <div key={item.id} className="p-4 rounded-lg border border-gray-100">
                <p className="text-sm font-medium" style={{ color: '#001B71' }}>{item.title}</p>
                <p className="text-xs text-gray-400">{item.source}</p>
                <p className="text-xs mt-1" style={{ color: '#00BC70' }}>{item.license}</p>
                <button onClick={() => handleImport(item)}
                  className="mt-2 px-3 py-1 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#2B5597' }}>
                  Importar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Nueva pregunta */}
      {showNewQuestion && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowNewQuestion(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Nueva pregunta</h3>
              <button onClick={() => setShowNewQuestion(false)} className="text-gray-400 hover:text-gray-600 text-xl">{'\u2715'}</button>
            </div>
            <form onSubmit={addQuestion} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pregunta</label>
                <textarea value={qForm.question_text} onChange={e => setQForm({ ...qForm, question_text: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm h-20" required placeholder="¿Cuál de las siguientes es una buena práctica?" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Opciones de respuesta</label>
                <p className="text-xs text-gray-400 mb-2">Marque la(s) correcta(s) con el checkbox</p>
                <div className="space-y-2">
                  {qForm.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="checkbox" checked={opt.correct}
                        onChange={e => {
                          const opts = [...qForm.options];
                          opts[i] = { ...opts[i], correct: e.target.checked };
                          setQForm({ ...qForm, options: opts });
                        }} className="w-4 h-4 rounded" />
                      <input value={opt.text} onChange={e => {
                        const opts = [...qForm.options];
                        opts[i] = { ...opts[i], text: e.target.value };
                        setQForm({ ...qForm, options: opts });
                      }} placeholder={`Opción ${i + 1}`}
                        className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setQForm({ ...qForm, options: [...qForm.options, { text: '', correct: false }] })}
                  className="text-xs text-blue-600 mt-2 hover:underline">+ Agregar opción</button>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
                Agregar pregunta
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Editar curso */}
      {editingCourse && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setEditingCourse(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>Editar contenido</h3>
              <button onClick={() => setEditingCourse(null)} className="text-gray-400 hover:text-gray-600 text-xl">{'\u2715'}</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
                <input value={editingCourse.title} onChange={e => setEditingCourse({ ...editingCourse, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nivel</label>
                <select value={editingCourse.level} onChange={e => setEditingCourse({ ...editingCourse, level: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="basico">Básico</option><option value="intermedio">Intermedio</option><option value="avanzado">Avanzado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción / Contenido</label>
                <textarea value={editingCourse.description}
                  onChange={e => setEditingCourse({ ...editingCourse, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm h-28 resize-y" />
              </div>
              {editingCourse.isVideoEmbed && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Enlace del video (YouTube o Vimeo)</label>
                  <input value={editingCourse.videoUrl} onChange={e => setEditingCourse({ ...editingCourse, videoUrl: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://www.youtube.com/watch?v=..." />
                  <p className="text-xs text-gray-400 mt-1">Deje vacío para conservar el enlace actual.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reemplazar archivo (opcional)</label>
                <input type="file" onChange={e => setEditingCourse({ ...editingCourse, file: e.target.files[0] })}
                  className="w-full text-sm" />
                <p className="text-xs text-gray-400 mt-1">Deje vacío si no desea cambiar el archivo actual.</p>
              </div>
              <button onClick={async () => {
                try {
                  // Update metadata
                  await api.put(`/admin/content/${editingCourse.id}`, {
                    title: editingCourse.title,
                    level: editingCourse.level,
                    description: editingCourse.description,
                    video_url: editingCourse.videoUrl,
                  });
                  // If new file, upload and replace
                  if (editingCourse.file) {
                    const fd = new FormData();
                    fd.append('title', editingCourse.title);
                    fd.append('level', editingCourse.level);
                    fd.append('description', editingCourse.description);
                    fd.append('file', editingCourse.file);
                    fd.append('replaceId', editingCourse.id);
                    await api.post('/admin/content/replace', fd);
                  }
                  setEditingCourse(null);
                  api.get('/admin/content').then(r => setCourses(r.data.data || []));
                  if (selectedCourse?.id === editingCourse.id) selectCourse({ ...selectedCourse, title: editingCourse.title, description: editingCourse.description });
                } catch (err) { alert(err.response?.data?.error || 'Error al guardar'); }
              }} className="w-full py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#001B71' }}>
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AI Content Designer */}
      {showAIDesigner && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { setShowAIDesigner(false); setAiResult(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title text-lg font-bold" style={{ color: '#001B71' }}>
                {'\u{1F916}'} Crear contenido con IA
              </h3>
              <button onClick={() => { setShowAIDesigner(false); setAiResult(null); }} className="text-gray-400 hover:text-gray-600 text-xl">{'\u2715'}</button>
            </div>

            {!aiResult ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tema de ciberseguridad</label>
                  <input value={aiForm.topic} onChange={e => setAiForm({ ...aiForm, topic: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="ej: Cómo identificar correos de phishing en el trabajo" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Duración</label>
                    <select value={aiForm.duration} onChange={e => setAiForm({ ...aiForm, duration: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="2 minutos">2 minutos</option>
                      <option value="5 minutos">5 minutos</option>
                      <option value="10 minutos">10 minutos</option>
                      <option value="15 minutos">15 minutos</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de contenido</label>
                    <select value={aiForm.content_type} onChange={e => setAiForm({ ...aiForm, content_type: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="video animado">Video animado</option>
                      <option value="presentación interactiva">Presentación interactiva</option>
                      <option value="infografía guiada">Infografía guiada</option>
                      <option value="podcast/audio corto">Podcast / Audio corto</option>
                      <option value="caso práctico simulado">Caso práctico simulado</option>
                    </select>
                  </div>
                </div>
                <button onClick={async () => {
                  if (!aiForm.topic.trim()) { alert('Ingrese un tema'); return; }
                  setAiLoading(true);
                  try {
                    const { data } = await api.post('/admin/content/generate-design', aiForm);
                    setAiResult(data.design);
                  } catch (err) { alert(err.response?.data?.error || 'Error al generar'); }
                  setAiLoading(false);
                }} disabled={aiLoading}
                  className="w-full py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: '#2B5597' }}>
                  {aiLoading ? 'Generando con IA...' : 'Generar diseño instruccional'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {aiResult.status !== 'ok' && aiResult.status && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-700">Status: {aiResult.status}</p>
                  </div>
                )}

                {/* Editable title */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Título del módulo (editable)</label>
                  <input value={aiResult.titulo_modulo || ''}
                    onChange={e => setAiResult({ ...aiResult, titulo_modulo: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-bold" style={{ color: '#001B71' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Objetivo de aprendizaje (editable)</label>
                  <input value={aiResult.objetivo_aprendizaje || ''}
                    onChange={e => setAiResult({ ...aiResult, objetivo_aprendizaje: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>

                {/* Editable sections */}
                {aiResult.estructura_contenido?.length > 0 && (
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold text-gray-500 uppercase">Secciones ({aiResult.estructura_contenido.length}) — clic para editar</h5>
                    {aiResult.estructura_contenido.map((bloque, i) => (
                      <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 flex justify-between items-center border-b">
                          <input value={bloque.bloque}
                            onChange={e => {
                              const updated = [...aiResult.estructura_contenido];
                              updated[i] = { ...updated[i], bloque: e.target.value };
                              setAiResult({ ...aiResult, estructura_contenido: updated });
                            }}
                            className="text-sm font-bold bg-transparent border-0 flex-1 focus:outline-none" style={{ color: '#001B71' }} />
                          <span className="text-xs text-gray-400 ml-2">{bloque.duracion_estimada}</span>
                        </div>
                        <div className="p-3">
                          {/* Image if recurso_visual contains an image URL */}
                          {bloque.recurso_visual && bloque.recurso_visual.includes('http') && (
                            <img src={bloque.recurso_visual} alt="" className="w-full h-40 object-cover rounded-lg mb-3" onError={e => e.target.style.display = 'none'} />
                          )}
                          <textarea value={bloque.contenido_guion}
                            onChange={e => {
                              const updated = [...aiResult.estructura_contenido];
                              updated[i] = { ...updated[i], contenido_guion: e.target.value };
                              setAiResult({ ...aiResult, estructura_contenido: updated });
                            }}
                            className="w-full text-sm text-gray-700 border rounded-lg px-3 py-2 leading-relaxed min-h-[100px] resize-y" />
                          {bloque.recurso_visual && !bloque.recurso_visual.includes('http') && (
                            <p className="text-xs text-blue-500 italic mt-1">{'\u{1F3A8}'} {bloque.recurso_visual}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Editable key points */}
                {aiResult.puntos_clave_recapitulacion?.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <h5 className="text-sm font-bold text-green-800 mb-2">Puntos clave</h5>
                    {aiResult.puntos_clave_recapitulacion.map((p, i) => (
                      <input key={i} value={p}
                        onChange={e => {
                          const updated = [...aiResult.puntos_clave_recapitulacion];
                          updated[i] = e.target.value;
                          setAiResult({ ...aiResult, puntos_clave_recapitulacion: updated });
                        }}
                        className="w-full text-sm text-green-700 bg-transparent border-b border-green-200 py-1 mb-1 focus:outline-none" />
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-3 border-t">
                  <button onClick={async () => {
                    try {
                      const content = (aiResult.estructura_contenido || []).map((b, i) => {
                        const imgTag = (b.recurso_visual && b.recurso_visual.includes('http')) ? `![${b.bloque}](${b.recurso_visual})\n\n` : '';
                        return `## ${i + 1}. ${b.bloque}\n\n${imgTag}${b.contenido_guion}\n`;
                      }).join('\n');
                      const fullContent = `# ${aiResult.titulo_modulo}\n\n**Objetivo:** ${aiResult.objetivo_aprendizaje}\n\n${content}\n\n---\n**Puntos clave:**\n${(aiResult.puntos_clave_recapitulacion || []).map(p => `- ${p}`).join('\n')}`;

                      await api.post('/admin/content/ai-save', {
                        title: aiResult.titulo_modulo || aiForm.topic,
                        description: fullContent,
                        level: 'basico',
                      });
                      alert('Material creado exitosamente. Ya puede asignarlo a una ruta de aprendizaje.');
                      setShowAIDesigner(false);
                      setAiResult(null);
                      api.get('/admin/content').then(r => setCourses(r.data.data || []));
                    } catch (err) { alert(err.response?.data?.error || 'Error al crear curso'); }
                  }} className="px-5 py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: '#00BC70' }}>
                    Crear como material de capacitación
                  </button>
                  <button onClick={() => setAiResult(null)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50">
                    Generar otro
                  </button>
                  <button onClick={() => { setShowAIDesigner(false); setAiResult(null); }}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
