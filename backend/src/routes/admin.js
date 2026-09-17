import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { syncAD } from '../services/ad-sync.js';
import { query, getConnection } from '../db.js';
import { recalculateUserScore } from '../services/risk-engine.js';

const router = Router();
router.use(authenticateToken, requireAdmin);

// ============ AD SYNC ============
router.post('/sync/ad', async (req, res) => {
  try {
    const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
    const startTime = Date.now();
    const stats = await syncAD({ dryRun });
    const duration = Date.now() - startTime;

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, details_json)
       VALUES (:1, :2, 'users', :3)`,
      [req.user.id, dryRun ? 'ad_sync_dry_run' : 'ad_sync', JSON.stringify({ stats, duration_ms: duration })]
    );

    res.json({ success: true, dryRun, duration_ms: duration, stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ USERS LIST ============
router.get('/users', async (req, res) => {
  try {
    const { ou, group, status, search, limit = 50, offset = 0, admins } = req.query;
    const params = [];
    const conditions = [];
    let idx = 1;

    // Filtro por status (activo/inactivo — "Archivado" en la UI == inactive)
    if (status && status !== '') {
      conditions.push(`u.status = :${idx++}`);
      params.push(status);
    }

    // Filtro por OU
    if (ou && ou !== '') {
      conditions.push(`u.org_unit_id = :${idx++}`);
      params.push(ou);
    }

    // Filtro por grupo unificado: "ou:<id>" o "cg:<id>" (grupo personalizado)
    if (group && group.includes(':')) {
      const [gType, gId] = group.split(':');
      if (gType === 'ou') {
        conditions.push(`u.org_unit_id = :${idx++}`);
        params.push(gId);
      } else if (gType === 'cg') {
        conditions.push(`EXISTS (SELECT 1 FROM custom_group_members cgm WHERE cgm.user_id = u.id AND cgm.group_id = :${idx++})`);
        params.push(gId);
      }
    }

    // Filtro por rol (Tipo: Todos / Usuario / Administrador)
    if (admins === 'only') {
      conditions.push('u.is_admin = 1');
    } else if (admins === 'exclude') {
      conditions.push('u.is_admin = 0');
    }

    // Búsqueda por nombre o email
    if (search && search.trim() !== '') {
      conditions.push(`(UPPER(u.display_name) LIKE UPPER(:${idx}) OR UPPER(u.email) LIKE UPPER(:${idx + 1}))`);
      params.push(`%${search.trim()}%`);
      params.push(`%${search.trim()}%`);
      idx += 2;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const limitNum = parseInt(limit, 10) || 50;
    const offsetNum = parseInt(offset, 10) || 0;

    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name, u.first_name, u.last_name, u.status, u.is_admin,
              u.risk_score, u.phish_prone, u.org_unit_id, u.department, u.job_title,
              ou.name AS org_unit_name, u.created_at, u.last_login_at,
              (SELECT COUNT(DISTINCT pr.campaign_id) FROM phishing_results pr WHERE pr.user_id = u.id AND pr.event = 'delivered') AS phish_total,
              (SELECT COUNT(DISTINCT pr.campaign_id) FROM phishing_results pr WHERE pr.user_id = u.id AND pr.event = 'clicked') AS phish_clicked,
              (SELECT LISTAGG(cg.name, ', ') WITHIN GROUP (ORDER BY cg.name)
                 FROM custom_group_members cgm JOIN custom_groups cg ON cgm.group_id = cg.id
                 WHERE cgm.user_id = u.id) AS custom_groups_csv
       FROM users u
       LEFT JOIN org_units ou ON u.org_unit_id = ou.id
       ${where}
       ORDER BY u.display_name
       OFFSET :${idx++} ROWS FETCH NEXT :${idx++} ROWS ONLY`,
      [...params, offsetNum, limitNum]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
      params
    );

    const data = rows.map(u => ({
      ...u,
      ppp: u.phish_total > 0 ? Math.round((u.phish_clicked / u.phish_total) * 100) : null,
    }));

    res.json({ data, total: parseInt(countRows[0]?.total || 0, 10) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ EDITAR USUARIO ============
router.put('/users/:id', async (req, res) => {
  try {
    const { display_name, first_name, last_name, email, department, job_title, org_unit_id } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;

    if (display_name !== undefined) { sets.push(`display_name = :${idx++}`); params.push(display_name); }
    if (first_name !== undefined) { sets.push(`first_name = :${idx++}`); params.push(first_name); }
    if (last_name !== undefined) { sets.push(`last_name = :${idx++}`); params.push(last_name); }
    if (email !== undefined) { sets.push(`email = :${idx++}`); params.push(email); }
    if (department !== undefined) { sets.push(`department = :${idx++}`); params.push(department); }
    if (job_title !== undefined) { sets.push(`job_title = :${idx++}`); params.push(job_title); }
    if (org_unit_id !== undefined) { sets.push(`org_unit_id = :${idx++}`); params.push(org_unit_id || null); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    const { rowsAffected } = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = :${idx}`,
      [...params, req.params.id]
    );
    if (rowsAffected === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json) VALUES ($1, 'user_edit', 'user', $2, $3)",
      [req.user.id, req.params.id, JSON.stringify(req.body)]
    );

    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name, u.first_name, u.last_name, u.status, u.is_admin,
              u.department, u.job_title, u.org_unit_id, ou.name AS org_unit_name
       FROM users u LEFT JOIN org_units ou ON u.org_unit_id = ou.id WHERE u.id = :1`,
      [req.params.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ IMPORTAR USUARIOS (CSV ya parseado en el cliente) ============
const MAX_IMPORT_ROWS = 2000;

router.post('/users/import', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: 'No se recibieron filas para importar' });
    if (rows.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Máximo ${MAX_IMPORT_ROWS} filas por importación` });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const email = (row.email || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped++;
        errors.push({ row: i + 1, reason: 'Correo inválido o vacío' });
        continue;
      }

      const displayName = (row.display_name || '').trim() || email.split('@')[0];
      const firstName = (row.first_name || '').trim() || null;
      const lastName = (row.last_name || '').trim() || null;
      const department = (row.department || '').trim() || null;
      const jobTitle = (row.job_title || '').trim() || null;
      const orgUnitId = row.org_unit_id || null;

      try {
        const { rows: existing } = await query('SELECT id FROM users WHERE UPPER(email) = UPPER(:1)', [email]);

        if (existing.length > 0) {
          await query(
            `UPDATE users SET display_name = :1, first_name = COALESCE(:2, first_name),
             last_name = COALESCE(:3, last_name), department = COALESCE(:4, department),
             job_title = COALESCE(:5, job_title), org_unit_id = COALESCE(:6, org_unit_id)
             WHERE id = :7`,
            [displayName, firstName, lastName, department, jobTitle, orgUnitId, existing[0].id]
          );
          updated++;
        } else {
          await query(
            `INSERT INTO users (email, display_name, first_name, last_name, department, job_title, org_unit_id, status)
             VALUES (:1, :2, :3, :4, :5, :6, :7, 'active')`,
            [email, displayName, firstName, lastName, department, jobTitle, orgUnitId]
          );
          created++;
        }
      } catch (rowErr) {
        skipped++;
        errors.push({ row: i + 1, reason: rowErr.message });
      }
    }

    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, details_json) VALUES ($1, 'user_import', 'user', $2)",
      [req.user.id, JSON.stringify({ total: rows.length, created, updated, skipped })]
    );

    res.json({ success: true, total: rows.length, created, updated, skipped, errors: errors.slice(0, 50) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ COMBINAR USUARIOS (fusión con reasignación transaccional de FKs) ============
// Tablas con constraint UNIQUE que combina user_id con otras columnas: hay que
// eliminar primero la fila del usuario "perdedor" cuando colisiona con una fila
// que el usuario "sobreviviente" ya tiene, para no violar la unicidad al reasignar.
const MERGE_UNIQUE_TABLES = [
  { table: 'phishing_results', userCol: 'user_id', matchCols: ['campaign_id', 'event'] },
  { table: 'training_enrollments', userCol: 'user_id', matchCols: ['course_id', 'campaign_id'] },
  { table: 'user_badges', userCol: 'user_id', matchCols: ['badge_id'] },
  { table: 'user_acknowledgments', userCol: 'user_id', matchCols: ['course_id'] },
  { table: 'custom_group_members', userCol: 'user_id', matchCols: ['group_id'] },
  { table: 'user_roles', userCol: 'user_id', matchCols: ['role_id'] },
];

// Tablas donde el usuario aparece como referencia simple (sin unicidad compuesta):
// basta con reasignar directamente.
const MERGE_SIMPLE_TABLES = [
  { table: 'user_quiz_attempts', userCol: 'user_id' },
  { table: 'pab_reports', userCol: 'user_id' },
  { table: 'risk_score_events', userCol: 'user_id' },
  { table: 'physical_test_events', userCol: 'user_id' },
  { table: 'user_notifications', userCol: 'user_id' },
  { table: 'audit_log', userCol: 'actor_id' },
  { table: 'courses', userCol: 'created_by' },
  { table: 'phishing_templates', userCol: 'created_by' },
  { table: 'phishing_campaigns', userCol: 'created_by' },
  { table: 'phishing_campaigns', userCol: 'authorized_by' },
  { table: 'training_campaigns', userCol: 'created_by' },
  { table: 'custom_groups', userCol: 'created_by' },
  { table: 'phishing_corporate_pages', userCol: 'created_by' },
  { table: 'physical_tests', userCol: 'created_by' },
  { table: 'app_settings', userCol: 'updated_by' },
  { table: 'roles', userCol: 'created_by' },
];

router.post('/users/merge', async (req, res) => {
  const { survivor_id, loser_id } = req.body || {};
  if (!survivor_id || !loser_id || survivor_id === loser_id) {
    return res.status(400).json({ error: 'survivor_id y loser_id son requeridos y deben ser distintos' });
  }

  const { rows: checkRows } = await query(
    'SELECT id, email, display_name FROM users WHERE id IN (:1, :2)',
    [survivor_id, loser_id]
  );
  if (checkRows.length !== 2) return res.status(404).json({ error: 'Alguno de los usuarios no existe' });
  const loserInfo = checkRows.find(r => r.id === loser_id);

  let connection;
  try {
    connection = await getConnection();

    for (const { table, userCol, matchCols } of MERGE_UNIQUE_TABLES) {
      const matchClause = matchCols
        .map(c => `(a.${c} = b.${c} OR (a.${c} IS NULL AND b.${c} IS NULL))`)
        .join(' AND ');

      await connection.execute(
        `DELETE FROM ${table} a WHERE a.${userCol} = :1 AND EXISTS (
           SELECT 1 FROM ${table} b WHERE b.${userCol} = :2 AND ${matchClause})`,
        [loser_id, survivor_id],
        { autoCommit: false }
      );
      await connection.execute(
        `UPDATE ${table} SET ${userCol} = :2 WHERE ${userCol} = :1`,
        [loser_id, survivor_id],
        { autoCommit: false }
      );
    }

    for (const { table, userCol } of MERGE_SIMPLE_TABLES) {
      await connection.execute(
        `UPDATE ${table} SET ${userCol} = :2 WHERE ${userCol} = :1`,
        [loser_id, survivor_id],
        { autoCommit: false }
      );
    }

    await connection.execute(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json)
       VALUES (:1, 'user_merge', 'user', :2, :3)`,
      [req.user.id, survivor_id, JSON.stringify({ survivor_id, loser_id, loser_email: loserInfo?.email })],
      { autoCommit: false }
    );

    await connection.execute('DELETE FROM users WHERE id = :1', [loser_id], { autoCommit: false });

    await connection.commit();
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch { /* noop */ }
    }
    return res.status(500).json({ error: 'Error al fusionar usuarios: ' + err.message });
  } finally {
    if (connection) await connection.close();
  }

  try { await recalculateUserScore(survivor_id); } catch { /* score se recalcula en el proximo evento si esto falla */ }

  res.json({ success: true });
});

// ============ QUICK ADD — usuario manual por correo (destinatario no sincronizado desde AD) ============
router.post('/users/quick-add', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim();
    const displayName = (req.body?.display_name || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Correo inválido' });
    }

    const { rows: existing } = await query(
      'SELECT id, email, display_name, first_name FROM users WHERE UPPER(email) = UPPER(:1)',
      [email]
    );
    if (existing.length > 0) {
      return res.json({ data: existing[0] });
    }

    const name = displayName || email.split('@')[0];

    await query(
      `INSERT INTO users (email, display_name, first_name, status)
       VALUES (:1, :2, :3, 'active')`,
      [email, name, name]
    );

    const { rows } = await query(
      'SELECT id, email, display_name, first_name FROM users WHERE UPPER(email) = UPPER(:1)',
      [email]
    );

    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json) VALUES ($1, 'user_quick_add', 'user', $2, $3)",
      [req.user.id, rows[0].id, JSON.stringify({ email })]
    );

    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ PROMOTE / DEMOTE ADMIN ============
router.patch('/users/:id/promote', async (req, res) => {
  try {
    await query('UPDATE users SET is_admin = 1 WHERE id = :1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/users/:id/demote', async (req, res) => {
  try {
    await query('UPDATE users SET is_admin = 0 WHERE id = :1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ORG UNITS ============
router.get('/org-units', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT ou.id, ou.name, ou.dn, ou.parent_id, ou.organization_id, ou.level_num,
              o.name AS organization_name,
              (SELECT COUNT(*) FROM users u WHERE u.org_unit_id = ou.id AND u.status = 'active') AS user_count
       FROM org_units ou
       LEFT JOIN organizations o ON ou.organization_id = o.id
       ORDER BY ou.name`
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ SYNC HISTORY ============
router.get('/sync/history', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, actor_id, action, details_json, created_at FROM audit_log
       WHERE action IN ('ad_sync', 'ad_sync_dry_run')
       ORDER BY created_at DESC
       FETCH FIRST 20 ROWS ONLY`
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
