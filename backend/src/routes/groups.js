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

// Listado unificado (OUs de AD + grupos personalizados) para filtros, selectores
// y la tabla principal de "Grupos". status: active|archived (omitir = todos).
// type: ou|custom (omitir = ambos).
router.get('/groups/all', async (req, res) => {
  try {
    const { status, type } = req.query;
    const archivedVal = status === 'archived' ? 1 : status === 'active' ? 0 : null;
    let data = [];

    if (!type || type === 'ou') {
      const where = archivedVal !== null ? 'WHERE ou.is_archived = :1' : '';
      const { rows: ous } = await query(
        `SELECT ou.id, ou.name, ou.created_at, ou.is_archived,
          (SELECT COUNT(*) FROM users u WHERE u.org_unit_id = ou.id AND u.status = 'active') AS member_count,
          (SELECT ROUND(AVG(u.risk_score), 1) FROM users u WHERE u.org_unit_id = ou.id AND u.status = 'active') AS avg_risk_score
         FROM org_units ou ${where} ORDER BY ou.name`,
        archivedVal !== null ? [archivedVal] : []
      );
      data = data.concat(ous.map(o => ({
        id: `ou:${o.id}`, raw_id: o.id, name: o.name, type: 'ou',
        created_at: o.created_at, member_count: o.member_count,
        avg_risk_score: o.avg_risk_score, is_archived: o.is_archived,
      })));
    }

    if (!type || type === 'custom') {
      const where = archivedVal !== null ? 'WHERE cg.is_archived = :1' : '';
      const { rows: groups } = await query(
        `SELECT cg.id, cg.name, cg.created_at, cg.is_archived,
          (SELECT COUNT(*) FROM custom_group_members cgm WHERE cgm.group_id = cg.id) AS member_count,
          (SELECT ROUND(AVG(u.risk_score), 1) FROM custom_group_members cgm JOIN users u ON cgm.user_id = u.id
             WHERE cgm.group_id = cg.id) AS avg_risk_score
         FROM custom_groups cg ${where} ORDER BY cg.name`,
        archivedVal !== null ? [archivedVal] : []
      );
      data = data.concat(groups.map(g => ({
        id: `cg:${g.id}`, raw_id: g.id, name: g.name, type: 'custom',
        created_at: g.created_at, member_count: g.member_count,
        avg_risk_score: g.avg_risk_score, is_archived: g.is_archived,
      })));
    }

    res.json({ data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Archivar / desarchivar en lote (grupos personalizados y/o OUs, mezclados)
router.post('/groups/set-archived', async (req, res) => {
  try {
    const { ids, archived } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids (array) requerido' });
    const val = archived ? 1 : 0;

    let updated = 0;
    for (const compositeId of ids) {
      const [gType, rawId] = String(compositeId).split(':');
      if (gType === 'cg') {
        await query('UPDATE custom_groups SET is_archived = :1 WHERE id = :2', [val, rawId]);
        updated++;
      } else if (gType === 'ou') {
        await query('UPDATE org_units SET is_archived = :1 WHERE id = :2', [val, rawId]);
        updated++;
      }
    }

    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, details_json) VALUES ($1, $2, 'group', $3)",
      [req.user.id, archived ? 'group_archive' : 'group_unarchive', JSON.stringify({ ids })]
    );

    res.json({ success: true, updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clonar un grupo (personalizado u OU) como un grupo personalizado nuevo,
// copiando sus miembros actuales.
router.post('/groups/clone', async (req, res) => {
  try {
    const [gType, rawId] = String(req.body?.id || '').split(':');
    let baseName;
    let memberIds;

    if (gType === 'cg') {
      const { rows } = await query('SELECT name FROM custom_groups WHERE id = :1', [rawId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
      baseName = rows[0].name;
      const { rows: m } = await query('SELECT user_id FROM custom_group_members WHERE group_id = :1', [rawId]);
      memberIds = m.map(r => r.user_id);
    } else if (gType === 'ou') {
      const { rows } = await query('SELECT name FROM org_units WHERE id = :1', [rawId]);
      if (rows.length === 0) return res.status(404).json({ error: 'OU no encontrada' });
      baseName = rows[0].name;
      const { rows: m } = await query("SELECT id AS user_id FROM users WHERE org_unit_id = :1 AND status = 'active'", [rawId]);
      memberIds = m.map(r => r.user_id);
    } else {
      return res.status(400).json({ error: 'id inválido' });
    }

    const newName = `${baseName} (copia)`;
    await query('INSERT INTO custom_groups (name, created_by) VALUES (:1, :2)', [newName, req.user.id]);
    const { rows: created } = await query(
      'SELECT id FROM custom_groups WHERE name = :1 AND created_by = :2 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY',
      [newName, req.user.id]
    );
    const newGroupId = created[0].id;

    for (const uid of memberIds) {
      try {
        await query('INSERT INTO custom_group_members (group_id, user_id) VALUES (:1, :2)', [newGroupId, uid]);
      } catch { /* ignore duplicados */ }
    }

    res.json({ success: true, data: { id: `cg:${newGroupId}`, name: newName, member_count: memberIds.length } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Quitar todos los miembros de un grupo personalizado (no aplica a OUs: la
// membresía de un OU la define Active Directory, no se edita localmente).
router.delete('/groups/:id/all-members', async (req, res) => {
  try {
    await query('DELETE FROM custom_group_members WHERE group_id = :1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Archivar (desactivar) a todos los miembros de un grupo (personalizado u OU)
router.post('/groups/archive-members', async (req, res) => {
  try {
    const [gType, rawId] = String(req.body?.id || '').split(':');
    let userIds;

    if (gType === 'cg') {
      const { rows } = await query('SELECT user_id FROM custom_group_members WHERE group_id = :1', [rawId]);
      userIds = rows.map(r => r.user_id);
    } else if (gType === 'ou') {
      const { rows } = await query("SELECT id FROM users WHERE org_unit_id = :1 AND status = 'active'", [rawId]);
      userIds = rows.map(r => r.id);
    } else {
      return res.status(400).json({ error: 'id inválido' });
    }

    for (const uid of userIds) {
      await query("UPDATE users SET status = 'inactive', deactivated_at = SYSTIMESTAMP WHERE id = :1", [uid]);
    }

    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, details_json) VALUES ($1, 'group_archive_members', 'group', $2)",
      [req.user.id, JSON.stringify({ id: req.body?.id, archived: userIds.length })]
    );

    res.json({ success: true, archived: userIds.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar nombre/descripción de un grupo personalizado (los OUs vienen de AD y no se editan aquí)
router.put('/groups/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;

    if (name) { sets.push(`name = :${idx++}`); params.push(name); }
    if (description !== undefined) { sets.push(`description = :${idx++}`); params.push(description); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    const { rowsAffected } = await query(
      `UPDATE custom_groups SET ${sets.join(', ')} WHERE id = :${idx}`,
      [...params, req.params.id]
    );
    if (rowsAffected === 0) return res.status(404).json({ error: 'Grupo no encontrado' });

    res.json({ success: true });
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
