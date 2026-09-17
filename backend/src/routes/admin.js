import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { syncAD } from '../services/ad-sync.js';
import { query } from '../db.js';

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
    const { ou, status, search, limit = 50, offset = 0, admins } = req.query;
    const params = [];
    const conditions = [];
    let idx = 1;

    // Filtro por status (activo/inactivo)
    if (status && status !== '') {
      conditions.push(`u.status = :${idx++}`);
      params.push(status);
    }

    // Filtro por OU
    if (ou && ou !== '') {
      conditions.push(`u.org_unit_id = :${idx++}`);
      params.push(ou);
    }

    // Filtro por rol admin
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
              ou.name AS org_unit_name, u.created_at
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

    res.json({ data: rows, total: parseInt(countRows[0]?.total || 0, 10) });
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

router.put('/users/:id/admin', async (req, res) => {
  try {
    const { isAdmin } = req.body;
    await query('UPDATE users SET is_admin = :1 WHERE id = :2', [isAdmin ? 1 : 0, req.params.id]);
    const { rows } = await query('SELECT id, email, display_name, is_admin FROM users WHERE id = :1', [req.params.id]);
    res.json({ data: rows[0] });
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
