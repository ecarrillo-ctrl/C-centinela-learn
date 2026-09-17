/**
 * eLearning AgroAmérica — AI Service via AWS Bedrock (Nova Micro)
 * Uses Prompt Caching for system prompts (up to 20K tokens cacheable).
 *
 * Prompt Caching: The system prompt is placed in a separate "system" field
 * with a cachePoint marker. This means the system prompt is cached across
 * requests, reducing latency and cost for repeated calls.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { query } from '../db.js';

const REGION = process.env.AWS_REGION || 'us-east-1';
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'arn:aws:bedrock:us-east-1:022995434684:application-inference-profile/yev9sg0bc2uh';

let bedrockClient = null;
function getBedrock() {
  if (!bedrockClient) bedrockClient = new BedrockRuntimeClient({ region: REGION });
  return bedrockClient;
}

/**
 * Invoke Nova via the inference profile.
 * Format: messages-only (no system field, no cachePoint — inference profiles
 * don't support those features).
 */
async function invokeNova(systemPrompt, userMessage) {
  const bedrock = getBedrock();

  // Inference profiles use simple messages format without system field
  const payload = {
    messages: [
      { role: 'user', content: [{ text: `${systemPrompt}\n\n${userMessage}` }] }
    ],
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.9,
    },
  };

  console.log(`[BEDROCK] Invoking model`);
  console.log(`[BEDROCK] Total prompt: ${systemPrompt.length + userMessage.length} chars`);

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  let raw;
  try {
    const response = await bedrock.send(command);
    raw = new TextDecoder().decode(response.body);
  } catch (err) {
    console.error(`[BEDROCK] SDK Error: ${err.name} — ${err.message}`);
    throw new Error(`Bedrock error: ${err.message}`);
  }

  console.log(`[BEDROCK] Response (${raw.length} chars): ${raw.substring(0, 400)}`);

  if (!raw.startsWith('{') && !raw.startsWith('[')) {
    throw new Error(`Respuesta bloqueada: ${raw.substring(0, 150)}`);
  }

  const body = JSON.parse(raw);

  if (body.amazon_bedrock_guardrailAction === 'BLOCKED') {
    throw new Error('Solicitud bloqueada por políticas del modelo.');
  }

  const text =
    body.output?.message?.content?.[0]?.text ||
    body.content?.[0]?.text ||
    body.completion ||
    body.results?.[0]?.outputText || '';

  if (!text) {
    throw new Error(`Respuesta vacía. Body: ${JSON.stringify(body).substring(0, 200)}`);
  }

  if (text.includes('no puede responder') || text.includes('Lo sentimos')) {
    throw new Error(`Modelo rechazó: ${text.substring(0, 150)}`);
  }

  if (body.usage) {
    console.log(`[BEDROCK] Tokens — in: ${body.usage.inputTokens}, out: ${body.usage.outputTokens}`);
  }

  return text;
}

function extractJSON(text) {
  if (!text || !text.trim()) throw new Error('Respuesta vacía de la IA');
  let cleaned = text.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  try { return JSON.parse(cleaned); } catch { }

  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch { } }

  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch { } }

  // Fix trailing commas
  const fixed = cleaned.replace(/,\s*([}\]])/g, '$1');
  const fixedMatch = fixed.match(/\{[\s\S]*\}/);
  if (fixedMatch) { try { return JSON.parse(fixedMatch[0]); } catch { } }

  throw new Error(`JSON no válido en respuesta: "${cleaned.substring(0, 100)}..."`);
}

// =============================================================================
// System Prompts (cached via cachePoint)
// =============================================================================

const ANALYSIS_SYSTEM = `Eres un asistente educativo corporativo. Analizas materiales de capacitación y extraes puntos clave para crear evaluaciones.

Instrucciones:
- Lee el material entre <documento> y </documento>.
- Extrae conceptos principales y puntos evaluables.
- Responde SOLO con JSON válido, sin texto adicional.
- Estructura: { "status": "ok", "resumen_ejecutivo": "2-3 oraciones", "conceptos_clave": ["5-8 items"], "puntos_evaluables": ["items"], "advertencias": [] }`;

const QUIZ_SYSTEM = `Eres un asistente que crea evaluaciones de opción múltiple para capacitación corporativa.

Instrucciones:
- Genera exactamente el número de preguntas solicitado.
- Cada pregunta: 4 opciones, solo 1 correcta, 3 incorrectas pero creíbles.
- Varía la posición de la correcta entre preguntas.
- Lenguaje claro y profesional en español.
- Responde SOLO con JSON válido, sin texto adicional.
- Estructura: { "preguntas": [{ "question_text": "string", "options": [{ "text": "string", "correct": true/false }] }], "advertencias": [] }`;

const CONTENT_SYSTEM = `Eres un diseñador de contenido educativo corporativo. Creas guiones y estructuras para módulos de capacitación.

Instrucciones:
- Diseña el módulo adaptado a la duración indicada.
- Formatos: video animado, presentación, infografía, podcast, caso práctico.
- Tono profesional y accesible.
- Responde SOLO con JSON válido, sin texto adicional.
- Estructura: { "status": "ok", "titulo_modulo": "string", "objetivo_aprendizaje": "string", "estructura_contenido": [{ "bloque": "string", "duracion_estimada": "string", "contenido_guion": "string", "recurso_visual": "string" }], "puntos_clave_recapitulacion": ["3-5 items"], "advertencias": [] }`;

// =============================================================================
// Exported Functions
// =============================================================================

export async function analyzeContent(title, description, documentText) {
  const userMsg = `Analiza este material de capacitación:

Título: ${title}
Descripción: ${description || 'Sin descripción'}

<documento>
${documentText || description || title}
</documento>

Responde con el JSON.`;

  const text = await invokeNova(ANALYSIS_SYSTEM, userMsg);
  return extractJSON(text);
}

export async function generateQuizFromCourse(courseId, options = {}) {
  const { numQuestions = 5, difficulty = 'medium' } = options;

  const { rows: courses } = await query(
    'SELECT id, title, description, course_type FROM courses WHERE id = :1', [courseId]
  );
  if (courses.length === 0) throw new Error('Curso no encontrado');
  const course = courses[0];

  // Get the actual course content — for AI-generated courses this is in description
  const courseContent = course.description || '';
  const courseTitle = course.title || '';

  // Sanitize trigger words for the guardrail
  const sanitize = (text) => text.replace(/phishing|ransomware|malware|hack|ataque|virus|exploit|ingeniería social/gi, 'riesgo digital');

  // If we have substantial content, skip analysis and go straight to quiz generation
  // using the content directly as context
  const hasContent = courseContent.length > 100;

  let contextForQuiz = '';
  if (hasContent) {
    // Use the actual course content directly (truncate to ~3000 chars to fit in context)
    contextForQuiz = sanitize(courseContent.substring(0, 3000));
    console.log(`[AI-QUIZ] Using course description as context (${courseContent.length} chars, truncated to ${contextForQuiz.length})`);
  } else {
    // Short content — try analysis
    try {
      const analysis = await analyzeContent(sanitize(courseTitle), sanitize(courseContent), sanitize(courseContent || courseTitle));
      contextForQuiz = `Resumen: ${analysis.resumen_ejecutivo || ''}\nConceptos: ${(analysis.conceptos_clave || []).join(', ')}\nPuntos: ${(analysis.puntos_evaluables || []).join(', ')}`;
    } catch (e) {
      console.warn('[AI-QUIZ] Analysis failed:', e.message);
      contextForQuiz = `Tema del curso: ${sanitize(courseTitle)}`;
    }
  }

  // Generate quiz based on the ACTUAL content
  const userMsg = `Genera exactamente ${numQuestions} preguntas de evaluación (nivel: ${difficulty}).

IMPORTANTE: Las preguntas DEBEN basarse ÚNICAMENTE en el siguiente contenido del curso. NO inventes información que no esté aquí. Cada pregunta debe poder responderse con la información proporcionada.

<contenido_del_curso>
${contextForQuiz}
</contenido_del_curso>

Responde con el JSON.`;

  console.log(`[AI-QUIZ] Generating ${numQuestions} questions from ${contextForQuiz.length} chars of content`);
  const text = await invokeNova(QUIZ_SYSTEM, userMsg);
  const result = extractJSON(text);
  const questions = (result.preguntas || result.questions || []).map(q => ({
    question_text: q.question_text,
    options: (q.options || []).map(o => ({ text: o.text, correct: !!o.correct })),
  }));

  if (questions.length === 0) throw new Error('No se generaron preguntas');
  return questions;
}

export async function generateContentDesign(topic, duration, contentType) {
  const contentPrompt = `Eres un experto en crear contenido educativo corporativo de alta calidad. Tu trabajo es generar módulos de capacitación COMPLETOS, listos para ser consumidos por empleados.

NO generes un esqueleto ni un outline. Genera el CONTENIDO REAL completo con toda la información que el empleado necesita aprender. Cada sección debe tener contenido sustancial y educativo con párrafos informativos, ejemplos concretos y consejos prácticos.

Instrucciones:
- Crea contenido completo, profesional y educativo listo para usar.
- Cada bloque es una diapositiva/sección con contenido REAL y extenso.
- "contenido_guion" debe tener MÍNIMO 3 párrafos informativos por sección con datos reales y ejemplos.
- Incluye ejemplos concretos del entorno laboral, datos prácticos y consejos accionables.
- Tono: profesional, directo, fácil de entender para cualquier empleado.
- Idioma: español claro.
- Adapta la profundidad al tiempo indicado.
- Responde SOLO con JSON válido.
- Estructura: { "status": "ok", "titulo_modulo": "string", "objetivo_aprendizaje": "string", "estructura_contenido": [{ "bloque": "Título", "duracion_estimada": "X minutos", "contenido_guion": "TEXTO COMPLETO EDUCATIVO extenso", "recurso_visual": "descripción del visual" }], "puntos_clave_recapitulacion": ["punto concreto"], "advertencias": [] }
- Genera entre 4 y 8 secciones con contenido extenso.`;

  const safeTopic = topic.replace(/phishing|ransomware|malware|hack|ataque|virus|exploit|ingeniería social/gi, 'protección digital');

  const userMsg = `Crea un módulo de capacitación COMPLETO y listo para usar:

Tema: ${safeTopic}
Duración total: ${duration}
Formato: ${contentType}

IMPORTANTE: Para cada sección, incluye en "recurso_visual" una URL de imagen relevante usando este formato exacto:
https://images.unsplash.com/photo-[ID]?w=800&h=400&fit=crop
Usa IDs reales de Unsplash que sean relevantes al tema (oficina, computadora, equipo, tecnología, trabajo, seguridad).

Ejemplos de IDs válidos:
- Oficina/trabajo: 1497366216548-37526070297c, 1497215842964-222b430dc094, 1521737604516-1f5dbdab3ebf
- Tecnología: 1518770660439-4636190af475, 1550751827307-0fcb4de1c82f, 1563986768609-3e99addf8add
- Seguridad/protección: 1555949963-ff9fe0c870eb, 1526374965328-7f61d4dc18c5, 1558494949-ef010cbdcc31

Genera contenido educativo real, extenso y profesional para empleados.

Responde con el JSON.`;

  const text = await invokeNova(contentPrompt, userMsg);
  return extractJSON(text);
}
