import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';

const router = Router();

// ============ USER: Obtener mis notificaciones ============
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, unread } = req.query;
    const isAdmin = req.user.isAdmin;

    // Scope filter: user sees 'all' + 'user' targeted to them; admin also sees 'admins'
    let scopeFilter = `(un.target_scope = 'all' OR (un.target_scope = 'user' AND un.user_id = :1))`;
    if (isAdmin) {
      scopeFilter = `(un.target_scope = 'all' OR un.target_scope = 'admins' OR (un.target_scope = 'user' AND un.user_id = :1))`;
    }

    let conditions = [scopeFilter];
    const params = [req.user.id];
    let idx = 2;

    if (unread === 'true') {
      conditions.push('un.is_read = 0');
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const { rows } = await query(
      `SELECT un.id, un.title, un.body, un.category, un.link_url, un.is_read, un.created_at
       FROM user_notifications un
       ${where}
       ORDER BY un.created_at DESC
       OFFSET :${idx++} ROWS FETCH NEXT :${idx++} ROWS ONLY`,
      [...params, parseInt(offset, 10), parseInt(limit, 10)]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM user_notifications un ${where}`,
      params
    );

    const { rows: unreadRows } = await query(
      `SELECT COUNT(*) AS unread_count FROM user_notifications un
       WHERE ${scopeFilter} AND un.is_read = 0`,
      [req.user.id]
    );

    res.json({
      data: rows,
      total: parseInt(countRows[0]?.total || 0, 10),
      unread_count: parseInt(unreadRows[0]?.unread_count || 0, 10),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ USER: Marcar como leída ============
router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await query('UPDATE user_notifications SET is_read = 1 WHERE id = :1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ USER: Marcar todas como leídas ============
router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await query(
      `UPDATE user_notifications SET is_read = 1
       WHERE (user_id = :1 OR user_id IS NULL) AND is_read = 0`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ADMIN: Crear notificación ============
router.post('/admin/notifications/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, body, category, target_scope, user_id, group, link_url } = req.body;
    if (!title) return res.status(400).json({ error: 'title es requerido' });

    // Envío a un grupo (OU o grupo personalizado): se abanica en una fila por
    // destinatario (target_scope='user') para reutilizar el mismo camino de
    // lectura que ya usan los usuarios, sin tocar el esquema de notificaciones.
    if (target_scope === 'group' && group && group.includes(':')) {
      const [gType, gId] = group.split(':');
      let recipients = [];

      if (gType === 'ou') {
        const { rows } = await query("SELECT id FROM users WHERE org_unit_id = :1 AND status = 'active'", [gId]);
        recipients = rows;
      } else if (gType === 'cg') {
        const { rows } = await query(
          `SELECT u.id FROM custom_group_members cgm JOIN users u ON cgm.user_id = u.id
           WHERE cgm.group_id = :1 AND u.status = 'active'`,
          [gId]
        );
        recipients = rows;
      }

      for (const r of recipients) {
        await query(
          `INSERT INTO user_notifications (user_id, target_scope, title, body, category, link_url)
           VALUES (:1, 'user', :2, :3, :4, :5)`,
          [r.id, title, body || '', category || 'info', link_url || null]
        );
      }

      return res.json({ success: true, sent_to: recipients.length });
    }

    await query(
      `INSERT INTO user_notifications (user_id, target_scope, title, body, category, link_url)
       VALUES (:1, :2, :3, :4, :5, :6)`,
      [
        target_scope === 'user' ? user_id : null,
        target_scope || 'all',
        title,
        body || '',
        category || 'info',
        link_url || null,
      ]
    );

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ADMIN: Listar todas las notificaciones enviadas ============
router.get('/admin/notifications/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT un.id, un.title, un.body, un.category, un.target_scope, un.user_id, un.link_url, un.created_at,
              u.display_name AS target_user_name
       FROM user_notifications un
       LEFT JOIN users u ON un.user_id = u.id
       ORDER BY un.created_at DESC
       FETCH FIRST 100 ROWS ONLY`
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
