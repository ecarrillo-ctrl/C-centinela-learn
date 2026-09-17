import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';

const router = Router();
router.use(authenticateToken, requireAdmin);

// Listar grupos personalizados
router.get('/groups', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT cg.id, cg.name, cg.description, cg.created_at,
              (SELECT COUNT(*) FROM custom_group_members cgm WHERE cgm.group_id = cg.id) AS member_count
       FROM custom_groups cg
       ORDER BY cg.name`
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Listado unificado (OUs de AD + grupos personalizados) para filtros y selectores
router.get('/groups/all', async (_req, res) => {
  try {
    const { rows: ous } = await query(
      `SELECT ou.id, ou.name,
        (SELECT COUNT(*) FROM users u WHERE u.org_unit_id = ou.id AND u.status = 'active') AS member_count
       FROM org_units ou ORDER BY ou.name`
    );
    const { rows: groups } = await query(
      `SELECT cg.id, cg.name,
        (SELECT COUNT(*) FROM custom_group_members cgm WHERE cgm.group_id = cg.id) AS member_count
       FROM custom_groups cg ORDER BY cg.name`
    );

    res.json({
      data: [
        ...ous.map(o => ({ id: `ou:${o.id}`, name: o.name, type: 'ou', member_count: o.member_count })),
        ...groups.map(g => ({ id: `cg:${g.id}`, name: g.name, type: 'custom', member_count: g.member_count })),
      ],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crear grupo
router.post('/groups', async (req, res) => {
  try {
    const { name, description, user_ids } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    await query(
      'INSERT INTO custom_groups (name, description, created_by) VALUES (:1, :2, :3)',
      [name, description || '', req.user.id]
    );

    const { rows } = await query(
      'SELECT id FROM custom_groups WHERE name = :1 AND created_by = :2 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY',
      [name, req.user.id]
    );
    const groupId = rows[0]?.id;

    // Agregar miembros si se proporcionaron
    if (user_ids && Array.isArray(user_ids)) {
      for (const userId of user_ids) {
        try {
          await query(
            'INSERT INTO custom_group_members (group_id, user_id) VALUES (:1, :2)',
            [groupId, userId]
          );
        } catch {} // ignore duplicates
      }
    }

    res.json({ success: true, group: { id: groupId, name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ver miembros de un grupo
router.get('/groups/:id/members', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name, u.org_unit_id, ou.name AS org_unit_name, cgm.added_at
       FROM custom_group_members cgm
       JOIN users u ON cgm.user_id = u.id
       LEFT JOIN org_units ou ON u.org_unit_id = ou.id
       WHERE cgm.group_id = :1
       ORDER BY u.display_name`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Agregar miembros a un grupo
router.post('/groups/:id/members', async (req, res) => {
  try {
    const { user_ids } = req.body;
    if (!user_ids || !Array.isArray(user_ids)) return res.status(400).json({ error: 'user_ids (array) requerido' });

    let added = 0;
    for (const userId of user_ids) {
      try {
        await query(
          `MERGE INTO custom_group_members cgm
           USING (SELECT :1 AS group_id, :2 AS user_id FROM DUAL) src
           ON (cgm.group_id = src.group_id AND cgm.user_id = src.user_id)
           WHEN NOT MATCHED THEN INSERT (group_id, user_id) VALUES (src.group_id, src.user_id)`,
          [req.params.id, userId]
        );
        added++;
      } catch {}
    }
    res.json({ success: true, added });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remover miembro de un grupo
router.delete('/groups/:id/members/:userId', async (req, res) => {
  try {
    await query(
      'DELETE FROM custom_group_members WHERE group_id = :1 AND user_id = :2',
      [req.params.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Eliminar grupo
router.delete('/groups/:id', async (req, res) => {
  try {
    await query('DELETE FROM custom_groups WHERE id = :1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
