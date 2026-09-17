import { useState, useEffect } from 'react';
import api from '../lib/api';

const STEPS = { CONTENT: 'content', QUIZ: 'quiz', SUMMARY: 'summary', COMPLETE: 'complete' };

export default function CourseViewer({ course, onClose }) {
  const [step, setStep] = useState(STEPS.CONTENT);
  const [quiz, setQuiz] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [lockedQuestions, setLockedQuestions] = useState(new Set());
  const [quizResult, setQuizResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingDiploma, setDownloadingDiploma] = useState(false);
  const [emailingDiploma, setEmailingDiploma] = useState(false);

  const courseId = course.id || course.ID;
  const courseType = course.type || course.course_type || course.COURSE_TYPE;
  const courseTitle = course.title || course.TITLE;
  const courseDesc = course.description || course.DESCRIPTION || '';

  useEffect(() => { loadQuiz(); }, [courseId]);

  async function loadQuiz() {
    try {
      const { data } = await api.get(`/courses/${courseId}/quiz`);
      setQuiz(data);
      if (data.already_passed) {
        setQuizResult({ passed: true, score: 100, message: 'Ya aprobaste este quiz.' });
        setStep(STEPS.COMPLETE);
      }
    } catch { }
  }

  const hasQuiz = quiz?.has_quiz && quiz?.questions?.length > 0;

  async function acknowledge() {
    setSubmitting(true);
    try {
      await api.post(`/courses/${courseId}/acknowledge`);
      setStep(STEPS.SUMMARY);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    setSubmitting(false);
  }

  function selectAnswer(qId, optId) {
    // Once a question is locked, can't change
    if (lockedQuestions.has(qId)) return;
    setAnswers(prev => ({ ...prev, [qId]: optId }));
    // Lock this question immediately
    setLockedQuestions(prev => new Set([...prev, qId]));
    // Auto advance after 600ms
    setTimeout(() => {
      if (currentQ < (quiz?.questions?.length || 0) - 1) {
        setCurrentQ(prev => prev + 1);
      }
    }, 600);
  }

  async function submitQuiz() {
    if (!quiz?.questions) return;
    const total = quiz.questions.length;
    const answered = Object.keys(answers).length;
    if (answered < total) {
      alert(`Debe responder todas las preguntas. Faltan ${total - answered}.`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = Object.entries(answers).map(([question_id, selected_option_id]) => ({
        question_id, selected_option_id,
      }));
      const { data } = await api.post(`/courses/${courseId}/quiz/submit`, { answers: payload });
      setQuizResult(data);
      if (data.passed) setStep(STEPS.SUMMARY);
    } catch (err) { alert(err.response?.data?.error || 'Error al enviar'); }
    setSubmitting(false);
  }

  async function downloadDiploma() {
    setDownloadingDiploma(true);
    try {
      const response = await api.get(`/courses/${courseId}/diploma`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Diploma-${courseTitle}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      let message = 'No se pudo generar el diploma.';
      if (err.response?.data instanceof Blob) {
        try {
          const parsed = JSON.parse(await err.response.data.text());
          message = parsed.error || message;
        } catch { /* respuesta no era JSON */ }
      }
      alert(message);
    }
    setDownloadingDiploma(false);
  }

  async function emailDiploma() {
    setEmailingDiploma(true);
    try {
      const { data } = await api.post(`/courses/${courseId}/diploma/send`);
      alert(`Diploma enviado a ${data.sent_to}`);
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo enviar el diploma por correo.');
    }
    setEmailingDiploma(false);
  }

  function retryQuiz() {
    setQuizResult(null);
    setAnswers({});
    setLockedQuestions(new Set());
    setCurrentQ(0);
    setStep(STEPS.QUIZ);
  }

  function goToQuiz() {
    if (quizResult?.passed) { setStep(STEPS.SUMMARY); return; }
    setStep(STEPS.QUIZ);
    setCurrentQ(0);
  }

  // Summary tips based on course title
  const summaryTips = getSummaryTips(courseTitle, courseDesc);

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: '#0f172a' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#001B71] text-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg">{courseType === 'scorm' ? '\u{1F4E6}' : courseType?.includes('video') ? '\u{1F3AC}' : '\u{1F4C4}'}</span>
          <div>
            <h2 className="text-sm font-bold">{courseTitle}</h2>
            <p className="text-xs text-white/60">
              {step === STEPS.CONTENT && 'Material de estudio'}
              {step === STEPS.QUIZ && `Evaluación — Pregunta ${currentQ + 1} de ${quiz?.questions?.length || 0}`}
              {step === STEPS.SUMMARY && 'Resumen del aprendizaje'}
              {step === STEPS.COMPLETE && 'Completado'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <StepDot active={step === STEPS.CONTENT} done={step !== STEPS.CONTENT} label="1" />
            <div className="w-4 h-0.5 bg-white/20" />
            <StepDot active={step === STEPS.QUIZ} done={step === STEPS.SUMMARY || step === STEPS.COMPLETE} label="2" />
            <div className="w-4 h-0.5 bg-white/20" />
            <StepDot active={step === STEPS.SUMMARY} done={step === STEPS.COMPLETE} label="3" />
            <div className="w-4 h-0.5 bg-white/20" />
            <StepDot active={step === STEPS.COMPLETE} done={false} label="4" />
          </div>
          <button onClick={onClose} className="ml-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white">
            Salir
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* STEP: CONTENT */}
        {step === STEPS.CONTENT && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 relative overflow-hidden">
              {courseType === 'scorm' && (
                <iframe src={`/api/content/scorm/${courseId}/launch`} className="w-full h-full border-0" title="SCORM" />
              )}
              {courseType === 'video_upload' && (
                <div className="w-full h-full flex items-center justify-center bg-black">
                  <video controls className="max-w-full max-h-full" autoPlay>
                    <source src={`/api/content/stream/${courseId}`} type="video/mp4" />
                  </video>
                </div>
              )}
              {courseType === 'video_embed' && (course.external_id || course.EXTERNAL_ID) && (
                <iframe src={getEmbedUrl(course.external_id || course.EXTERNAL_ID || course.source_url || course.SOURCE_URL)}
                  className="w-full h-full border-0" allowFullScreen title="Video" />
              )}
              {courseType === 'video_embed' && !(course.external_id || course.EXTERNAL_ID) && (
                <iframe src={`/api/content/pdf/${courseId}`} className="w-full h-full border-0" title="Contenido"
                  sandbox="allow-same-origin allow-scripts" />
              )}
              {(courseType === 'pdf' || courseType === 'presentation' || courseType === 'document') && (
                <iframe src={`/api/content/pdf/${courseId}#toolbar=0&navpanes=0`} className="w-full h-full border-0" title="Documento"
                  sandbox="allow-same-origin allow-scripts" />
              )}
              {courseType === 'image' && (
                <div className="w-full h-full overflow-auto bg-gray-900 flex items-center justify-center p-6"
                  onContextMenu={e => e.preventDefault()}>
                  <img src={`/api/content/pdf/${courseId}`} alt={courseTitle} draggable="false"
                    className="rounded-lg shadow-lg select-none" style={{ maxWidth: '90%', maxHeight: 'calc(100vh - 250px)', objectFit: 'contain', pointerEvents: 'none' }} />
                </div>
              )}
              {courseType === 'audio' && (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  <div className="text-center">
                    <div className="text-6xl mb-6">{'\u{1F3B5}'}</div>
                    <h3 className="text-white text-lg font-bold mb-4">{courseTitle}</h3>
                    <audio controls className="w-80">
                      <source src={`/api/content/stream/${courseId}`} />
                    </audio>
                  </div>
                </div>
              )}
            </div>
            <div className="shrink-0 bg-[#1e293b] px-6 py-4 flex items-center justify-between">
              <p className="text-sm text-white/60">Revise todo el material antes de continuar</p>
              <button onClick={() => hasQuiz ? goToQuiz() : acknowledge()} disabled={submitting}
                className="px-6 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition-all hover:scale-105"
                style={{ backgroundColor: '#00BC70' }}>
                {submitting ? 'Procesando...' : hasQuiz ? 'Continuar al quiz \u2192' : 'He terminado \u2713'}
              </button>
            </div>
          </div>
        )}

        {/* STEP: QUIZ */}
        {step === STEPS.QUIZ && quiz && !quizResult && (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-2xl">
              {quiz.questions.map((q, qi) => {
                if (qi !== currentQ) return null;
                const qId = q.id || q.ID;
                const options = q.options || [];
                const isLocked = lockedQuestions.has(qId);
                return (
                  <div key={qId}>
                    <div className="mb-6 text-center">
                      <span className="text-xs text-white/40 uppercase tracking-widest">
                        Pregunta {qi + 1} de {quiz.questions.length}
                      </span>
                      {isLocked && (
                        <span className="ml-2 text-xs text-green-400">{'\u{1F512}'} Respuesta registrada</span>
                      )}
                    </div>
                    <div className="bg-white rounded-2xl p-8 shadow-2xl mb-6">
                      <h3 className="text-lg font-bold mb-6" style={{ color: '#001B71' }}>
                        {q.question_text || q.QUESTION_TEXT}
                      </h3>
                      <div className="space-y-3">
                        {options.map((opt, oi) => {
                          const optId = opt.id || opt.ID;
                          const selected = answers[qId] === optId;
                          const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
                          return (
                            <button key={optId}
                              onClick={() => selectAnswer(qId, optId)}
                              disabled={isLocked}
                              className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${selected
                                ? 'border-[#001B71] bg-blue-50 shadow-md'
                                : isLocked
                                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                                }`}>
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${selected ? 'bg-[#001B71] text-white' : 'bg-gray-100 text-gray-500'
                                }`}>{letters[oi]}</span>
                              <span className={`text-sm ${selected ? 'font-medium text-[#001B71]' : 'text-gray-700'}`}>
                                {opt.option_text || opt.OPTION_TEXT}
                              </span>
                              {selected && <span className="ml-auto text-[#001B71]">{'\u2713'}</span>}
                            </button>
                          );
                        })}
                      </div>
                      {isLocked && (
                        <p className="text-xs text-gray-400 text-center mt-4">
                          {'\u{1F512}'} Su respuesta ha sido registrada y no puede ser modificada.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Navigation — only forward, no going back to answered questions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                  disabled={currentQ === 0 || lockedQuestions.has(quiz.questions[currentQ - 1]?.id || quiz.questions[currentQ - 1]?.ID)}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed">
                  {'\u2190'} Anterior
                </button>

                <div className="flex gap-1.5">
                  {quiz.questions.map((q, i) => {
                    const qId = q.id || q.ID;
                    const answered = !!answers[qId];
                    return (
                      <div key={i}
                        className={`w-3 h-3 rounded-full transition-all ${i === currentQ ? 'bg-white scale-125 ring-2 ring-white/50'
                          : answered ? 'bg-[#00BC70]'
                            : 'bg-white/30'
                          }`} />
                    );
                  })}
                </div>

                {currentQ < quiz.questions.length - 1 ? (
                  <button onClick={() => setCurrentQ(currentQ + 1)}
                    disabled={!lockedQuestions.has(quiz.questions[currentQ]?.id || quiz.questions[currentQ]?.ID)}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed">
                    Siguiente {'\u2192'}
                  </button>
                ) : (
                  <button onClick={submitQuiz}
                    disabled={submitting || Object.keys(answers).length < quiz.questions.length}
                    className="px-6 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ backgroundColor: '#00BC70' }}>
                    {submitting ? 'Evaluando...' : 'Enviar respuestas'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* QUIZ RESULT — not passed */}
        {step === STEPS.QUIZ && quizResult && !quizResult.passed && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl p-10 shadow-2xl max-w-md w-full text-center">
              <div className="text-6xl mb-4">{'\u{1F614}'}</div>
              <h3 className="text-2xl font-bold mb-2" style={{ color: '#e74c3c' }}>No aprobado</h3>
              <p className="text-4xl font-bold my-4" style={{ color: '#001B71' }}>{quizResult.score}%</p>
              <p className="text-sm text-gray-500 mb-2">
                {quizResult.correct} de {quizResult.total} correctas
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Necesita 70% para aprobar. Revise el material e intente de nuevo.
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => { setStep(STEPS.CONTENT); retryQuiz(); }}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
                  Revisar material
                </button>
                <button onClick={retryQuiz}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: '#001B71' }}>
                  Intentar de nuevo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP: SUMMARY */}
        {step === STEPS.SUMMARY && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-lg w-full">
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">{'\u{1F4D6}'}</div>
                <h3 className="text-xl font-bold" style={{ color: '#001B71' }}>Resumen del aprendizaje</h3>
                <p className="text-sm text-gray-500 mt-1">{courseTitle}</p>
              </div>

              <div className="space-y-3 mb-6">
                {summaryTips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <span className="text-lg shrink-0">{tip.icon}</span>
                    <p className="text-sm text-gray-700">{tip.text}</p>
                  </div>
                ))}
              </div>

              {quizResult?.passed && (
                <div className="text-center p-4 rounded-lg bg-green-50 border border-green-200 mb-4">
                  <p className="text-sm font-bold text-green-700">
                    {'\u2705'} Quiz aprobado con {quizResult.score}%
                  </p>
                </div>
              )}

              <button onClick={() => setStep(STEPS.COMPLETE)}
                className="w-full py-3 rounded-lg text-sm font-bold text-white transition-all hover:scale-[1.02]"
                style={{ backgroundColor: '#00BC70' }}>
                Continuar {'\u2192'}
              </button>
            </div>
          </div>
        )}

        {/* STEP: COMPLETE */}
        {step === STEPS.COMPLETE && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl p-10 shadow-2xl max-w-md w-full text-center">
              <div className="text-6xl mb-4">{'\u{1F389}'}</div>
              <h3 className="text-2xl font-bold mb-2" style={{ color: '#00BC70' }}>Capacitación completada</h3>
              <p className="text-sm text-gray-500 mb-6">
                Su progreso ha sido registrado. Siga aplicando estos conocimientos en su trabajo diario.
              </p>
              <div className="flex gap-2 mb-3">
                <button onClick={downloadDiploma} disabled={downloadingDiploma}
                  className="flex-1 px-4 py-3 rounded-lg text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#00BC70' }}>
                  {'\u{1F4DC}'} {downloadingDiploma ? 'Generando...' : 'Descargar diploma'}
                </button>
                <button onClick={emailDiploma} disabled={emailingDiploma}
                  className="flex-1 px-4 py-3 rounded-lg text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#2B5597' }}>
                  {'✉️'} {emailingDiploma ? 'Enviando...' : 'Enviar por correo'}
                </button>
              </div>
              <button onClick={onClose}
                className="px-8 py-3 rounded-lg text-sm font-bold text-white transition-all hover:scale-105"
                style={{ backgroundColor: '#001B71' }}>
                Volver a mis capacitaciones
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getEmbedUrl(idOrUrl) {
  if (!idOrUrl) return '';
  const str = String(idOrUrl).trim();
  // Already a YouTube embed URL
  if (str.includes('youtube.com/embed/')) return str;
  // YouTube watch URL
  const ytWatch = str.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}?rel=0`;
  // YouTube short URL
  const ytShort = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}?rel=0`;
  // Vimeo
  const vimeo = str.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  // Just a video ID (11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return `https://www.youtube.com/embed/${str}?rel=0`;
  // Generic URL — try embedding directly
  return str;
}

function StepDot({ active, done, label }) {
  const bg = active ? '#00BC70' : done ? '#00BC70' : 'rgba(255,255,255,0.2)';
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${active ? 'ring-2 ring-white/50' : ''}`}
      style={{ backgroundColor: bg, color: active || done ? 'white' : 'rgba(255,255,255,0.5)' }}>
      {done && !active ? '\u2713' : label}
    </div>
  );
}

function getSummaryTips(title, description) {
  const t = (title + ' ' + description).toLowerCase();
  const tips = [];

  if (t.includes('phishing') || t.includes('correo') || t.includes('email')) {
    tips.push({ icon: '\u{1F4E7}', text: 'Siempre verifique el remitente real del correo antes de hacer clic en enlaces o descargar adjuntos.' });
    tips.push({ icon: '\u{26A0}\u{FE0F}', text: 'Desconfíe de mensajes que generan urgencia, miedo o promesas demasiado buenas.' });
    tips.push({ icon: '\u{1F6E1}\u{FE0F}', text: 'Use el botón PAB (Phish Alert Button) para reportar correos sospechosos al equipo de seguridad.' });
  }
  if (t.includes('contraseña') || t.includes('password') || t.includes('clave') || t.includes('mfa') || t.includes('autenticacion')) {
    tips.push({ icon: '\u{1F512}', text: 'Use contraseñas únicas de al menos 12 caracteres para cada servicio.' });
    tips.push({ icon: '\u{1F4F1}', text: 'Active la autenticación de dos factores (2FA/MFA) en todas las cuentas que lo permitan.' });
    tips.push({ icon: '\u{1F6AB}', text: 'Nunca comparta sus credenciales por correo, chat o teléfono — ni siquiera con TI.' });
  }
  if (t.includes('ransomware') || t.includes('malware') || t.includes('virus')) {
    tips.push({ icon: '\u{1F4BE}', text: 'Mantenga respaldos actualizados de su información importante.' });
    tips.push({ icon: '\u{1F6AB}', text: 'No descargue ni ejecute archivos de fuentes desconocidas.' });
    tips.push({ icon: '\u{1F4BB}', text: 'Mantenga su sistema operativo y antivirus siempre actualizados.' });
  }
  if (t.includes('usb') || t.includes('dispositivo') || t.includes('movil') || t.includes('físico')) {
    tips.push({ icon: '\u{1F4BE}', text: 'Nunca conecte dispositivos USB desconocidos a su computadora corporativa.' });
    tips.push({ icon: '\u{1F4F1}', text: 'Bloquee su computadora siempre que se aleje de su escritorio (Win+L).' });
    tips.push({ icon: '\u{1F512}', text: 'No deje documentos sensibles visibles en su escritorio físico.' });
  }
  if (t.includes('red') || t.includes('wifi') || t.includes('vpn') || t.includes('protocolo')) {
    tips.push({ icon: '\u{1F310}', text: 'No use redes WiFi públicas para acceder a sistemas corporativos sin VPN.' });
    tips.push({ icon: '\u{1F512}', text: 'Verifique que los sitios web usen HTTPS antes de ingresar información.' });
    tips.push({ icon: '\u{1F4BB}', text: 'Reporte cualquier comportamiento inusual en su red o equipo al equipo de TI.' });
  }
  if (t.includes('basc') || t.includes('dato') || t.includes('personal') || t.includes('confidencial')) {
    tips.push({ icon: '\u{1F4CB}', text: 'Clasifique la información según su nivel de confidencialidad antes de compartirla.' });
    tips.push({ icon: '\u{1F465}', text: 'Solo comparta datos personales con personas autorizadas y por canales seguros.' });
    tips.push({ icon: '\u{1F5D1}\u{FE0F}', text: 'Destruya documentos físicos confidenciales correctamente (trituradora).' });
  }
  if (t.includes('ingenieria social') || t.includes('social') || t.includes('manipulacion')) {
    tips.push({ icon: '\u{1F3AD}', text: 'Los atacantes pueden hacerse pasar por compañeros, proveedores o autoridades.' });
    tips.push({ icon: '\u{260E}\u{FE0F}', text: 'Verifique solicitudes inusuales por un segundo canal antes de actuar.' });
    tips.push({ icon: '\u{1F9E0}', text: 'Si algo se siente extraño o urgente, deténgase y piense antes de actuar.' });
  }

  // Default tips if none matched
  if (tips.length === 0) {
    tips.push({ icon: '\u{1F6E1}\u{FE0F}', text: 'La seguridad es responsabilidad de todos. Manténgase alerta en su trabajo diario.' });
    tips.push({ icon: '\u{1F4E2}', text: 'Reporte cualquier incidente o sospecha al equipo de seguridad de TI.' });
    tips.push({ icon: '\u{1F4DA}', text: 'Continúe capacitándose. Las amenazas evolucionan constantemente.' });
  }

  return tips.slice(0, 4); // Max 4 tips
}

function ContentRenderer({ text, title }) {
  if (!text) return <p className="text-gray-400">Sin contenido</p>;

  const sections = text.split(/^## /m).filter(Boolean);

  if (sections.length <= 1) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4" style={{ color: '#001B71' }}>{title}</h1>
        <div className="text-gray-700 leading-relaxed whitespace-pre-line">{text}</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sections.map((section, i) => {
        const lines = section.split('\n');
        const sectionTitle = lines[0].replace(/^#+\s*/, '').trim();
        const body = lines.slice(1).join('\n').trim();

        // Extract image markdown ![alt](url)
        const imgMatch = body.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        const imgUrl = imgMatch ? imgMatch[1] : null;
        const textContent = body.replace(/!\[.*?\]\(https?:\/\/[^\s)]+\)\n*/g, '').trim();

        return (
          <div key={i} className="border-b border-gray-100 pb-6 last:border-0">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: '#001B71' }}>{i + 1}</span>
              <h2 className="text-lg font-bold" style={{ color: '#001B71' }}>{sectionTitle}</h2>
            </div>
            {imgUrl && (
              <img src={imgUrl} alt={sectionTitle} className="w-full h-48 object-cover rounded-lg mb-4" onError={e => e.target.style.display = 'none'} />
            )}
            <div className="pl-11 text-gray-700 leading-relaxed whitespace-pre-line text-sm">{textContent}</div>
          </div>
        );
      })}
    </div>
  );
}
