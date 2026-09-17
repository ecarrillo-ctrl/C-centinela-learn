import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';

const router = Router();
router.use(authenticateToken, requireAdmin);

const VALID_PERMISSIONS = ['users', 'phishing', 'training', 'reports', 'settings', 'physical_tests'];

function safeParse(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}

router.get('/permissions/catalog', (_req, res) => {
  res.json({ data: VALID_PERMISSIONS });
});

router.get('/roles', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.name, r.description, r.permissions_json, r.created_at,
        (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS assigned_count
       FROM roles r ORDER BY r.name`
    );
    res.json({ data: rows.map(r => ({ ...r, permissions: safeParse(r.permissions_json) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/roles', async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });
    const perms = (Array.isArray(permissions) ? permissions : []).filter(p => VALID_PERMISSIONS.includes(p));

    await query(
      'INSERT INTO roles (name, description, permissions_json, created_by) VALUES (:1, :2, :3, :4)',
      [name, description || '', JSON.stringify(perms), req.user.id]
    );

    const { rows } = await query(
      'SELECT id, name, description, permissions_json, created_at FROM roles WHERE name = :1 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY',
      [name]
    );

    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json) VALUES ($1, 'role_create', 'role', $2, $3)",
      [req.user.id, rows[0].id, JSON.stringify({ name, permissions: perms })]
    );

    res.json({ data: { ...rows[0], permissions: perms } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/roles/:id', async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;

    if (name) { sets.push(`name = :${idx++}`); params.push(name); }
    if (description !== undefined) { sets.push(`description = :${idx++}`); params.push(description); }
    if (permissions !== undefined) {
      const perms = (Array.isArray(permissions) ? permissions : []).filter(p => VALID_PERMISSIONS.includes(p));
      sets.push(`permissions_json = :${idx++}`);
      params.push(JSON.stringify(perms));
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    const { rowsAffected } = await query(
      `UPDATE roles SET ${sets.join(', ')} WHERE id = :${idx}`,
      [...params, req.params.id]
    );
    if (rowsAffected === 0) return res.status(404).json({ error: 'Rol no encontrado' });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/roles/:id', async (req, res) => {
  try {
    const { rowsAffected } = await query('DELETE FROM roles WHERE id = :1', [req.params.id]);
    if (rowsAffected === 0) return res.status(404).json({ error: 'Rol no encontrado' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/roles/:id/assignments', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name FROM user_roles ur
       JOIN users u ON ur.user_id = u.id
       WHERE ur.role_id = :1 ORDER BY u.display_name`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/roles/:id/assign', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });

    await query(
      `MERGE INTO user_roles ur
       USING (SELECT :1 AS user_id, :2 AS role_id FROM DUAL) src
       ON (ur.user_id = src.user_id AND ur.role_id = src.role_id)
       WHEN NOT MATCHED THEN INSERT (user_id, role_id) VALUES (src.user_id, src.role_id)`,
      [user_id, req.params.id]
    );

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/roles/:id/assign/:userId', async (req, res) => {
  try {
    await query('DELETE FROM user_roles WHERE role_id = :1 AND user_id = :2', [req.params.id, req.params.userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
