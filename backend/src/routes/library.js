import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';
import { applyRiskEvent } from '../services/risk-engine.js';
import { evaluateBadges } from '../services/badges.js';

const router = Router();

// ============ VIDEO EMBED (admin) ============
router.post('/admin/content/embed', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, level, source_url, source_license, external_id } = req.body;
    if (!title || !external_id || !source_license) {
      return res.status(400).json({ error: 'title, external_id y source_license son requeridos' });
    }

    await query(
      `INSERT INTO courses (title, description, level_type, course_type, source_license, source_url, external_id, created_by)
       VALUES (:1, :2, :3, 'video_embed', :4, :5, :6, :7)`,
      [title, description || '', level || 'basico', source_license, source_url || null, external_id, req.user.id]
    );

    const { rows } = await query(
      `SELECT id FROM courses WHERE external_id = :1 AND created_by = :2 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [external_id, req.user.id]
    );

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json)
       VALUES (:1, 'content_embed_register', 'course', :2, :3)`,
      [req.user.id, rows[0]?.ID || rows[0]?.id, JSON.stringify({ title, source_license, external_id })]
    );

    res.json({ success: true, course: { id: rows[0]?.ID || rows[0]?.id, title, type: 'video_embed' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ AI GENERATED CONTENT (admin) ============
router.post('/admin/content/ai-save', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, level } = req.body;
    if (!title) return res.status(400).json({ error: 'title es requerido' });

    await query(
      `INSERT INTO courses (title, description, level_type, course_type, source_license, created_by)
       VALUES (:1, :2, :3, 'document', :4, :5)`,
      [title, description || '', level || 'basico', 'Generado con IA — eLearning AgroAmérica', req.user.id]
    );

    const { rows } = await query(
      `SELECT id FROM courses WHERE title = :1 AND created_by = :2 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [title, req.user.id]
    );

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json)
       VALUES (:1, 'content_ai_create', 'course', :2, :3)`,
      [req.user.id, rows[0]?.id, JSON.stringify({ title, source: 'ai_generated' })]
    );

    res.json({ success: true, course: { id: rows[0]?.id, title, type: 'document' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CATALOGO DE FUENTES PUBLICAS ============
router.get('/library/catalog', authenticateToken, async (_req, res) => {
  try {
    const catalog = [
      { id: 'cisa-phishing-guide', title: 'CISA — Guia de Concientizacion sobre Phishing', description: 'Material del dominio publico de CISA.', type: 'pdf', level: 'basico', source: 'CISA', sourceUrl: 'https://www.cisa.gov/resources-tools/resources/phishing-infographic', license: 'Dominio publico — Gobierno de EE.UU.', language: 'es', tags: ['phishing', 'basico'] },
      { id: 'cisa-mfa-guide', title: 'CISA — Autenticacion Multifactor (MFA)', description: 'Guia sobre la importancia de MFA.', type: 'pdf', level: 'basico', source: 'CISA', sourceUrl: 'https://www.cisa.gov/MFA', license: 'Dominio publico — Gobierno de EE.UU.', language: 'es', tags: ['mfa', 'basico'] },
      { id: 'incibe-ransomware', title: 'INCIBE — Proteccion contra Ransomware', description: 'Guia practica de INCIBE.', type: 'pdf', level: 'intermedio', source: 'INCIBE', sourceUrl: 'https://www.incibe.es/protege-tu-empresa', license: 'Uso libre — INCIBE', language: 'es', tags: ['ransomware', 'intermedio'] },
      { id: 'incibe-passwords', title: 'INCIBE — Gestion Segura de Contraseñas', description: 'Buenas practicas de contraseñas.', type: 'pdf', level: 'basico', source: 'INCIBE', sourceUrl: 'https://www.incibe.es/empresas', license: 'Uso libre — INCIBE', language: 'es', tags: ['contraseñas', 'basico'] },
      { id: 'youtube-social-engineering', title: 'Ingenieria Social — Tecnicas y Defensa', description: 'Video educativo sobre ingenieria social.', type: 'video_embed', level: 'intermedio', source: 'YouTube', sourceUrl: 'https://www.youtube.com/watch?v=example', license: 'Creative Commons', language: 'es', tags: ['ingenieria-social', 'video'] },
      { id: 'youtube-basc-overview', title: 'Introduccion a la Seguridad BASC', description: 'Video introductorio sobre BASC.', type: 'video_embed', level: 'basico', source: 'YouTube', sourceUrl: 'https://www.youtube.com/watch?v=example2', license: 'Creative Commons', language: 'es', tags: ['basc', 'basico'] },
    ];
    res.json({ data: catalog });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/library/catalog/import', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { catalogId, title, description, level, type, source, sourceUrl, license } = req.body;
    if (!title || !license) return res.status(400).json({ error: 'title y license son requeridos' });

    const recordType = type === 'video_embed' ? 'video_embed' : 'pdf';

    await query(
      `INSERT INTO courses (title, description, level_type, course_type, source_license, source_url, created_by)
       VALUES (:1, :2, :3, :4, :5, :6, :7)`,
      [title, `${description || ''}\n\nFuente: ${source}\nLicencia: ${license}`, level || 'basico', recordType, license, sourceUrl || null, req.user.id]
    );

    const { rows } = await query(
      `SELECT id FROM courses WHERE title = :1 AND created_by = :2 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [title, req.user.id]
    );

    res.json({ success: true, course: { id: rows[0]?.ID || rows[0]?.id, title, type: recordType, source_license: license } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ LEARNING PATHS (admin) ============
router.get('/admin/learning-paths', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const { rows: paths } = await query(
      'SELECT id, name, description, is_active, created_at FROM learning_paths WHERE is_active = 1 ORDER BY created_at DESC'
    );

    for (const p of paths) {
      const pathId = p.ID || p.id;
      const { rows: courses } = await query(
        `SELECT c.id, c.title, c.course_type, c.level_type, lpc.sort_order
         FROM learning_path_courses lpc
         JOIN courses c ON lpc.course_id = c.id
         WHERE lpc.path_id = :1 AND c.deleted_at IS NULL
         ORDER BY lpc.sort_order`,
        [pathId]
      );
      p.courses = courses;
    }

    res.json({ data: paths });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/learning-paths', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, course_ids } = req.body;
    if (!name || !course_ids || !Array.isArray(course_ids)) {
      return res.status(400).json({ error: 'name y course_ids (array) son requeridos' });
    }

    await query(
      'INSERT INTO learning_paths (name, description) VALUES (:1, :2)',
      [name, description || '']
    );

    const { rows } = await query(
      `SELECT id FROM learning_paths WHERE name = :1 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [name]
    );
    const pathId = rows[0]?.ID || rows[0]?.id;

    for (let i = 0; i < course_ids.length; i++) {
      await query(
        'INSERT INTO learning_path_courses (path_id, course_id, sort_order) VALUES (:1, :2, :3)',
        [pathId, course_ids[i], i + 1]
      );
    }

    res.json({ success: true, path: { id: pathId, name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar ruta de aprendizaje
router.put('/admin/learning-paths/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, course_ids } = req.body;
    const pathId = req.params.id;

    if (name || description !== undefined) {
      const sets = [];
      const params = [];
      let idx = 1;
      if (name) { sets.push(`name = :${idx++}`); params.push(name); }
      if (description !== undefined) { sets.push(`description = :${idx++}`); params.push(description); }
      await query(`UPDATE learning_paths SET ${sets.join(', ')} WHERE id = :${idx}`, [...params, pathId]);
    }

    if (course_ids && Array.isArray(course_ids)) {
      await query('DELETE FROM learning_path_courses WHERE path_id = :1', [pathId]);
      for (let i = 0; i < course_ids.length; i++) {
        await query(
          'INSERT INTO learning_path_courses (path_id, course_id, sort_order) VALUES (:1, :2, :3)',
          [pathId, course_ids[i], i + 1]
        );
      }
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Eliminar ruta de aprendizaje
router.delete('/admin/learning-paths/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM learning_path_courses WHERE path_id = :1', [req.params.id]);
    const { rowsAffected } = await query('UPDATE learning_paths SET is_active = 0 WHERE id = :1', [req.params.id]);
    if (rowsAffected === 0) return res.status(404).json({ error: 'Ruta no encontrada' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ LEARNING PATHS (user) ============
router.get('/library/learning-paths', authenticateToken, async (req, res) => {
  try {
    const { rows: paths } = await query(
      'SELECT id, name, description FROM learning_paths WHERE is_active = 1 ORDER BY created_at DESC'
    );

    for (const p of paths) {
      const pathId = p.ID || p.id;
      const { rows: courses } = await query(
        `SELECT c.id, c.title, c.course_type, c.level_type, lpc.sort_order,
                te.status AS enrollment_status, te.progress_pct, te.completed_at
         FROM learning_path_courses lpc
         JOIN courses c ON lpc.course_id = c.id AND c.deleted_at IS NULL AND c.is_active = 1
         LEFT JOIN training_enrollments te ON te.course_id = c.id AND te.user_id = :1
         WHERE lpc.path_id = :2
         ORDER BY lpc.sort_order`,
        [req.user.id, pathId]
      );
      p.courses = courses;
      p.all_completed = courses.length > 0 && courses.every(c => (c.ENROLLMENT_STATUS || c.enrollment_status) === 'completed');
    }

    res.json({ data: paths });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ BADGES ============
router.get('/admin/badges', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT b.id, b.name, b.description, b.icon_url, b.criteria_json, b.created_at,
              (SELECT COUNT(*) FROM user_badges ub WHERE ub.badge_id = b.id) AS earned_count
       FROM badges b ORDER BY b.created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/badges', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, icon_url, criteria } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    await query(
      'INSERT INTO badges (name, description, icon_url, criteria_json) VALUES (:1, :2, :3, :4)',
      [name, description || '', icon_url || null, JSON.stringify(criteria || {})]
    );

    const { rows } = await query(
      `SELECT id, name, description FROM badges WHERE name = :1 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [name]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/library/badges', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT b.id, b.name, b.description, b.icon_url, b.criteria_json, ub.earned_at,
              CASE WHEN ub.id IS NOT NULL THEN 1 ELSE 0 END AS earned
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = :1
       ORDER BY CASE WHEN ub.id IS NOT NULL THEN 0 ELSE 1 END, ub.earned_at DESC, b.created_at`,
      [req.user.id]
    );
    // El criterio completo no se expone; solo la pista de "cómo obtenerla".
    const data = rows.map(({ criteria_json, ...b }) => {
      let hint = null;
      try { hint = JSON.parse(criteria_json || '{}').hint || null; } catch { /* sin pista */ }
      return { ...b, hint };
    });
    res.json({ data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Revisa y otorga las insignias pendientes del usuario actual
router.post('/library/check-badges', authenticateToken, async (req, res) => {
  try {
    const badges = await evaluateBadges(req.user.id);
    res.json({
      success: true,
      awarded: badges.length,
      badges,
      message: badges.length > 0 ? `${badges.length} insignia(s) otorgada(s)` : 'No hay nuevas insignias',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
