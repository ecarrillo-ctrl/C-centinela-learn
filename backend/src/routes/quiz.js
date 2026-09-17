import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';
import { generateQuizFromCourse, generateContentDesign, analyzeContent } from '../services/ai-quiz-generator.js';
import { getFileInfo, getFileStream } from '../services/storage-service.js';

const router = Router();

// ============ ADMIN: Gestionar cuestionarios ============

// Obtener preguntas de un curso
router.get('/admin/courses/:courseId/questions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows: questions } = await query(
      'SELECT id, question_text, question_type, sort_order, is_required FROM course_questions WHERE course_id = :1 ORDER BY sort_order',
      [req.params.courseId]
    );

    for (const q of questions) {
      const { rows: options } = await query(
        'SELECT id, option_text, is_correct, sort_order FROM course_question_options WHERE question_id = :1 ORDER BY sort_order',
        [q.id]
      );
      q.options = options;
    }

    res.json({ data: questions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Agregar pregunta a un curso
router.post('/admin/courses/:courseId/questions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { question_text, question_type, options, is_required } = req.body;
    if (!question_text) return res.status(400).json({ error: 'question_text es requerido' });

    // Obtener el siguiente sort_order
    const { rows: maxOrder } = await query(
      'SELECT NVL(MAX(sort_order), 0) + 1 AS next_order FROM course_questions WHERE course_id = :1',
      [req.params.courseId]
    );
    const sortOrder = maxOrder[0]?.next_order || 1;

    await query(
      'INSERT INTO course_questions (course_id, question_text, question_type, sort_order, is_required) VALUES (:1, :2, :3, :4, :5)',
      [req.params.courseId, question_text, question_type || 'multiple_choice', sortOrder, is_required !== false ? 1 : 0]
    );

    const { rows } = await query(
      'SELECT id FROM course_questions WHERE course_id = :1 AND sort_order = :2',
      [req.params.courseId, sortOrder]
    );
    const questionId = rows[0]?.id;

    // Agregar opciones si es multiple_choice o true_false
    if (options && Array.isArray(options)) {
      for (let i = 0; i < options.length; i++) {
        await query(
          'INSERT INTO course_question_options (question_id, option_text, is_correct, sort_order) VALUES (:1, :2, :3, :4)',
          [questionId, options[i].text, options[i].correct ? 1 : 0, i + 1]
        );
      }
    }

    res.json({ success: true, question: { id: questionId, question_text, sort_order: sortOrder } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar pregunta
router.put('/admin/courses/:courseId/questions/:questionId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { question_text } = req.body;
    if (!question_text) return res.status(400).json({ error: 'question_text requerido' });
    await query('UPDATE course_questions SET question_text = :1 WHERE id = :2 AND course_id = :3',
      [question_text, req.params.questionId, req.params.courseId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Eliminar pregunta
router.delete('/admin/courses/:courseId/questions/:questionId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM course_questions WHERE id = :1 AND course_id = :2', [req.params.questionId, req.params.courseId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ USUARIO: Tomar quiz ============

// Obtener quiz de un curso (para el usuario)
router.get('/courses/:courseId/quiz', authenticateToken, async (req, res) => {
  try {
    const { rows: questions } = await query(
      'SELECT id, question_text, question_type, sort_order FROM course_questions WHERE course_id = :1 ORDER BY sort_order',
      [req.params.courseId]
    );

    for (const q of questions) {
      const { rows: options } = await query(
        'SELECT id, option_text, sort_order FROM course_question_options WHERE question_id = :1 ORDER BY sort_order',
        [q.id]
      );
      // No enviar is_correct al usuario
      q.options = options;
    }

    // Verificar si ya aprobó
    const { rows: attempts } = await query(
      'SELECT id, score, passed, attempted_at FROM user_quiz_attempts WHERE user_id = :1 AND course_id = :2 ORDER BY attempted_at DESC FETCH FIRST 1 ROWS ONLY',
      [req.user.id, req.params.courseId]
    );

    res.json({
      questions,
      has_quiz: questions.length > 0,
      last_attempt: attempts[0] || null,
      already_passed: attempts.length > 0 && attempts[0].passed === 1,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Enviar respuestas del quiz
router.post('/courses/:courseId/quiz/submit', authenticateToken, async (req, res) => {
  try {
    const { answers } = req.body; // [{question_id, selected_option_id}]
    if (!answers || !Array.isArray(answers)) return res.status(400).json({ error: 'answers (array) requerido' });

    const { rows: questions } = await query(
      'SELECT id, question_text FROM course_questions WHERE course_id = :1',
      [req.params.courseId]
    );

    let correct = 0;
    let total = questions.length;

    for (const answer of answers) {
      if (!answer.question_id || !answer.selected_option_id) continue;
      const { rows } = await query(
        'SELECT is_correct FROM course_question_options WHERE id = :1 AND question_id = :2',
        [answer.selected_option_id, answer.question_id]
      );
      if (rows.length > 0 && rows[0].is_correct === 1) {
        correct++;
      }
    }

    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = score >= 70; // 70% para aprobar

    // Se calcula ANTES de insertar el intento actual: si no hay intentos previos, este es el primero.
    const { rows: priorAttempts } = await query(
      'SELECT COUNT(*) AS cnt FROM user_quiz_attempts WHERE user_id = :1 AND course_id = :2',
      [req.user.id, req.params.courseId]
    );
    const isFirstAttempt = parseInt(priorAttempts[0]?.cnt || 0, 10) === 0;

    await query(
      'INSERT INTO user_quiz_attempts (user_id, course_id, score, passed, answers_json) VALUES (:1, :2, :3, :4, :5)',
      [req.user.id, req.params.courseId, score, passed ? 1 : 0, JSON.stringify(answers)]
    );

    // Si aprobó, actualizar enrollment a completed
    if (passed) {
      await query(
        `UPDATE training_enrollments SET status = 'completed', progress_pct = 100, completed_at = SYSTIMESTAMP
         WHERE user_id = :1 AND course_id = :2 AND status != 'completed'`,
        [req.user.id, req.params.courseId]
      );
    }

    res.json({
      success: true,
      score,
      passed,
      correct,
      total,
      is_first_attempt: isFirstAttempt,
      diploma_eligible: passed && isFirstAttempt,
      message: passed ? 'Aprobado. Capacitación completada.' : `Reprobado (${score}%). Necesita 70% para aprobar. Puede intentar de nuevo.`,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ USUARIO: Confirmar aprendizaje (acknowledgment) ============

router.post('/courses/:courseId/acknowledge', authenticateToken, async (req, res) => {
  try {
    // Verificar si ya confirmó
    const { rows: existing } = await query(
      'SELECT id FROM user_acknowledgments WHERE user_id = :1 AND course_id = :2',
      [req.user.id, req.params.courseId]
    );

    if (existing.length > 0) {
      return res.json({ success: true, message: 'Ya confirmó este curso anteriormente', already: true, diploma_eligible: true });
    }

    await query(
      'INSERT INTO user_acknowledgments (user_id, course_id, ip) VALUES (:1, :2, :3)',
      [req.user.id, req.params.courseId, req.ip]
    );

    // Actualizar enrollment a completed si no hay quiz
    const { rows: questions } = await query(
      'SELECT COUNT(*) AS cnt FROM course_questions WHERE course_id = :1',
      [req.params.courseId]
    );

    if (parseInt(questions[0]?.cnt || 0) === 0) {
      // No hay quiz — marcar como completado directamente
      await query(
        `UPDATE training_enrollments SET status = 'completed', progress_pct = 100, completed_at = SYSTIMESTAMP
         WHERE user_id = :1 AND course_id = :2 AND status != 'completed'`,
        [req.user.id, req.params.courseId]
      );
    }

    res.json({ success: true, message: 'Confirmación de aprendizaje registrada', diploma_eligible: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ AI: Generar quiz con Bedrock ============
router.post('/admin/courses/:courseId/generate-quiz', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { numQuestions = 5, difficulty = 'medium', customPrompt = '' } = req.body;
    console.log(`[AI-QUIZ] Generating ${numQuestions} questions for course ${req.params.courseId}`);

    const questions = await generateQuizFromCourse(req.params.courseId, {
      numQuestions: Math.min(parseInt(numQuestions, 10) || 5, 15),
      difficulty,
      customPrompt,
    });

    // Optionally auto-save to DB
    if (req.body.autoSave) {
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        // Get next sort order
        const { rows: maxOrder } = await query(
          'SELECT NVL(MAX(sort_order), 0) + 1 AS next_order FROM course_questions WHERE course_id = :1',
          [req.params.courseId]
        );
        const sortOrder = (maxOrder[0]?.next_order || 1) + qi;

        await query(
          'INSERT INTO course_questions (course_id, question_text, question_type, sort_order, is_required) VALUES (:1, :2, :3, :4, 1)',
          [req.params.courseId, q.question_text, 'multiple_choice', sortOrder]
        );

        const { rows } = await query(
          'SELECT id FROM course_questions WHERE course_id = :1 AND sort_order = :2',
          [req.params.courseId, sortOrder]
        );
        const questionId = rows[0]?.id;

        if (questionId && q.options) {
          for (let oi = 0; oi < q.options.length; oi++) {
            await query(
              'INSERT INTO course_question_options (question_id, option_text, is_correct, sort_order) VALUES (:1, :2, :3, :4)',
              [questionId, q.options[oi].text, q.options[oi].correct ? 1 : 0, oi + 1]
            );
          }
        }
      }
    }

    res.json({
      success: true,
      questions,
      saved: !!req.body.autoSave,
      message: req.body.autoSave
        ? `${questions.length} preguntas generadas y guardadas`
        : `${questions.length} preguntas generadas (no guardadas — revise y confirme)`,
    });
  } catch (err) {
    console.error('[AI-QUIZ] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ AI: Generar diseño de contenido ============
router.post('/admin/content/generate-design', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { topic, duration, content_type } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic es requerido' });

    console.log(`[AI-CONTENT] Request: topic="${topic}" duration="${duration}" type="${content_type}"`);
    const design = await generateContentDesign(
      topic,
      duration || '5 minutos',
      content_type || 'presentación interactiva'
    );

    res.json({ success: true, design });
  } catch (err) {
    console.error('[AI-CONTENT] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ AI: Test endpoint — prueba simple de Bedrock ============
router.post('/admin/ai/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    const testMsg = message || 'Genera 2 preguntas de opción múltiple sobre buenas prácticas en el uso de computadoras en una oficina. Responde en JSON: { "preguntas": [{ "question_text": "...", "options": [{"text": "...", "correct": true/false}] }] }';

    const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const modelId = process.env.BEDROCK_MODEL_ID || 'arn:aws:bedrock:us-east-1:022995434684:application-inference-profile/yev9sg0bc2uh';

    const payload = {
      messages: [{ role: 'user', content: [{ text: testMsg }] }],
      inferenceConfig: { maxTokens: 2048, temperature: 0.7 },
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await client.send(command);
    const raw = new TextDecoder().decode(response.body);

    res.json({ success: true, modelId, raw_response: raw.substring(0, 2000), prompt_sent: testMsg.substring(0, 200) });
  } catch (err) {
    res.status(500).json({ error: err.message, name: err.name, metadata: err.$metadata || null });
  }
});

// ============ USUARIO: Descargar diploma de finalización ============
router.get('/courses/:courseId/diploma', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const { rows: enrollments } = await query(
      `SELECT completed_at FROM training_enrollments
       WHERE user_id = :1 AND course_id = :2 AND status = 'completed'
       ORDER BY completed_at DESC FETCH FIRST 1 ROWS ONLY`,
      [req.user.id, courseId]
    );
    if (enrollments.length === 0) {
      return res.status(403).json({ error: 'Aún no ha completado esta capacitación' });
    }

    const { rows: attempts } = await query(
      'SELECT passed FROM user_quiz_attempts WHERE user_id = :1 AND course_id = :2 ORDER BY attempted_at ASC FETCH FIRST 1 ROWS ONLY',
      [req.user.id, courseId]
    );
    const hadQuiz = attempts.length > 0;
    const passedFirstAttempt = !hadQuiz || attempts[0].passed === 1;
    if (!passedFirstAttempt) {
      return res.status(403).json({ error: 'El diploma solo se otorga si aprobó el quiz en su primer intento' });
    }

    const { rows: courseRows } = await query('SELECT title FROM courses WHERE id = :1', [courseId]);
    if (courseRows.length === 0) return res.status(404).json({ error: 'Curso no encontrado' });

    const { rows: userRows } = await query('SELECT display_name FROM users WHERE id = :1', [req.user.id]);
    const userName = userRows[0]?.display_name || req.user.displayName || 'Usuario';
    const courseTitle = courseRows[0].title;
    const completedAt = enrollments[0].completed_at;

    const { rows: settingRows } = await query(
      "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('diploma_signer_name', 'diploma_signer_title', 'org_name')"
    );
    const settingsMap = {};
    for (const s of settingRows) settingsMap[s.setting_key] = s.setting_value;
    const signerName = settingsMap.diploma_signer_name || 'Eddy Aguilar';
    const signerTitle = settingsMap.diploma_signer_title || 'Director TI Corporativo';
    const orgName = settingsMap.org_name || 'AgroAmérica';

    // Firma escaneada (opcional) — si no hay ninguna subida, el espacio queda en blanco
    // (no se dibuja un nombre de relleno en cursiva).
    let signatureBuffer = null;
    try {
      const info = await getFileInfo('branding/signature.png');
      if (info) {
        const { body } = await getFileStream('branding/signature.png');
        const chunks = [];
        for await (const chunk of body) chunks.push(chunk);
        signatureBuffer = Buffer.concat(chunks);
      }
    } catch { /* sin firma escaneada */ }

    // Logo (opcional) — se sube desde Ajustes > Marca > Logotipo, mismo archivo que
    // usan los correos y otros reportes. Se prueban las extensiones más comunes.
    let logoBuffer = null;
    for (const ext of ['png', 'jpg', 'jpeg']) {
      try {
        const info = await getFileInfo(`branding/logo.${ext}`);
        if (info) {
          const { body } = await getFileStream(`branding/logo.${ext}`);
          const chunks = [];
          for await (const chunk of body) chunks.push(chunk);
          logoBuffer = Buffer.concat(chunks);
          break;
        }
      } catch { /* no existe con esta extensión, se prueba la siguiente */ }
    }

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Diploma-${courseTitle.replace(/[^a-z0-9]+/gi, '-')}.pdf"`);
      res.send(pdf);
    });

    const navy = '#001B71';
    const green = '#00BC70';
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    // Marco decorativo
    doc.rect(20, 20, pageW - 40, pageH - 40).lineWidth(3).stroke(navy);
    doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(1).stroke(green);

    // Logo — esquina superior izquierda
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 55, 45, { fit: [55, 55] });
      } catch { /* imagen inválida — se omite el logo */ }
    }

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(12)
      .text('AgroAmerica', 0, 70, { align: 'center' });

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(34)
      .text('Diploma de Capacitación', 0, 110, { align: 'center' });

    doc.moveTo(pageW / 2 - 100, 160).lineTo(pageW / 2 + 100, 160).lineWidth(1.5).stroke(green);

    doc.fillColor('#555').font('Helvetica').fontSize(13)
      .text('Se otorga el presente diploma a', 0, 190, { align: 'center' });

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(28)
      .text(userName, 0, 220, { align: 'center' });

    const completionText = hadQuiz
      ? `por haber completado satisfactoriamente la capacitación, aprobando el examen en su primer intento`
      : `por haber completado satisfactoriamente la capacitación`;

    doc.fillColor('#555').font('Helvetica').fontSize(13)
      .text(completionText, 100, 265, { align: 'center', width: pageW - 200 });

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(18)
      .text(`"${courseTitle}"`, 100, 295, { align: 'center', width: pageW - 200 });

    const dateStr = completedAt ? new Date(completedAt).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    doc.fillColor('#888').font('Helvetica').fontSize(11)
      .text(`Fecha de finalización: ${dateStr}`, 0, 335, { align: 'center' });

    // Firma — si hay una imagen escaneada se dibuja sobre la línea; si no, el
    // espacio queda en blanco (no se pone un nombre de relleno en cursiva).
    const sigY = pageH - 130;
    const sigCenterX = pageW / 2;
    if (signatureBuffer) {
      try {
        doc.image(signatureBuffer, sigCenterX - 60, sigY - 45, { width: 120, height: 45 });
      } catch { /* imagen inválida — se ignora, el espacio queda en blanco */ }
    }
    doc.moveTo(sigCenterX - 100, sigY).lineTo(sigCenterX + 100, sigY).lineWidth(1).stroke('#999');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(navy)
      .text(`${signerName}, ${signerTitle}`, sigCenterX - 150, sigY + 10, { width: 300, align: 'center' });

    doc.font('Helvetica').fontSize(8).fillColor('#aaa')
      .text(`Generado por eLearning ${orgName} — Plataforma de Concientización en Ciberseguridad`, 0, pageH - 45, { align: 'center' });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
