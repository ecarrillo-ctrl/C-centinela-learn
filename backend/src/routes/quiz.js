import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';
import { generateQuizFromCourse, generateContentDesign, analyzeContent } from '../services/ai-quiz-generator.js';
import { generateDiplomaPdf, DiplomaError } from '../services/diploma-service.js';
import { evaluateBadgesSafe, awardBadgesByType } from '../services/badges.js';
import { sendEmail } from '../services/mailer.js';

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
    const { question_text, options } = req.body;
    if (!question_text) return res.status(400).json({ error: 'question_text requerido' });

    // Las opciones se validan antes de tocar nada, para no dejar la pregunta a medias.
    let cleanOptions = null;
    if (Array.isArray(options)) {
      cleanOptions = options.filter(o => o && String(o.text || '').trim());
      if (cleanOptions.length < 2) return res.status(400).json({ error: 'Agregue al menos 2 opciones' });
      if (!cleanOptions.some(o => o.correct)) return res.status(400).json({ error: 'Marque al menos una opción correcta' });
    }

    const { rowsAffected } = await query('UPDATE course_questions SET question_text = :1 WHERE id = :2 AND course_id = :3',
      [question_text, req.params.questionId, req.params.courseId]);
    if (rowsAffected === 0) return res.status(404).json({ error: 'Pregunta no encontrada' });

    if (cleanOptions) {
      // Las respuestas de los usuarios no referencian opciones, así que se pueden reemplazar.
      await query('DELETE FROM course_question_options WHERE question_id = :1', [req.params.questionId]);
      for (let i = 0; i < cleanOptions.length; i++) {
        await query(
          'INSERT INTO course_question_options (question_id, option_text, is_correct, sort_order) VALUES (:1, :2, :3, :4)',
          [req.params.questionId, String(cleanOptions[i].text).trim(), cleanOptions[i].correct ? 1 : 0, i + 1]
        );
      }
    }
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

    // Insignias: el intento ya está registrado, así que "Primer intento", "Héroe cibernético",
    // "Triplete", etc. se evalúan con datos reales y se otorgan al instante.
    const newBadges = passed ? await evaluateBadgesSafe(req.user.id) : [];

    res.json({
      success: true,
      score,
      passed,
      correct,
      total,
      new_badges: newBadges,
      diploma_eligible: passed,
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

    const newBadges = await evaluateBadgesSafe(req.user.id);

    res.json({ success: true, message: 'Confirmación de aprendizaje registrada', diploma_eligible: true, new_badges: newBadges });
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
    const { buffer, courseTitle } = await generateDiplomaPdf(req.user.id, req.params.courseId, req.user.displayName);
    // Insignia "Graduado": se otorga al descargar el diploma (no bloquea la descarga si falla).
    awardBadgesByType(req.user.id, 'diploma_downloaded').catch(() => { });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Diploma-${courseTitle.replace(/[^a-z0-9]+/gi, '-')}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(err instanceof DiplomaError ? err.statusCode : 500).json({ error: err.message });
  }
});

// ============ USUARIO: Enviar diploma por correo (a su propio correo) ============
router.post('/courses/:courseId/diploma/send', authenticateToken, async (req, res) => {
  try {
    const { buffer, courseTitle, userName } = await generateDiplomaPdf(req.user.id, req.params.courseId, req.user.displayName);

    const { rows } = await query('SELECT email FROM users WHERE id = :1', [req.user.id]);
    const recipient = rows[0]?.email || req.user.email;
    if (!recipient) return res.status(400).json({ error: 'No se encontró un correo para enviar el diploma' });

    await sendEmail(
      recipient,
      `Su diploma de capacitación — ${courseTitle}`,
      `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#001B71;color:white;padding:20px;text-align:center;">
            <h2>eLearning AgroAmérica</h2>
            <p style="opacity:0.8;">Su diploma de capacitación</p>
          </div>
          <div style="padding:20px;background:#f9f9f9;">
            <p>Estimado(a) <strong>${userName}</strong>,</p>
            <p>Adjunto encontrará su diploma por haber completado satisfactoriamente la capacitación
               <strong>"${courseTitle}"</strong>.</p>
            <p>¡Felicidades por su compromiso con la seguridad de la información!</p>
          </div>
          <div style="padding:10px;text-align:center;font-size:12px;color:#888;">
            eLearning AgroAmérica — Plataforma de Concientización en Ciberseguridad
          </div>
        </div>`,
      [{ filename: `Diploma-${courseTitle.replace(/[^a-z0-9]+/gi, '-')}.pdf`, content: buffer }]
    );

    res.json({ success: true, sent_to: recipient });
  } catch (err) {
    res.status(err instanceof DiplomaError ? err.statusCode : 500).json({ error: err.message });
  }
});

export default router;
