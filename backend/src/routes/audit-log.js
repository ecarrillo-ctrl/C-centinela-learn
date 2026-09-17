import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';

const router = Router();
router.use(authenticateToken, requireAdmin);

router.get('/audit-log', async (req, res) => {
  try {
    const { limit = 50, offset = 0, action, from, to } = req.query;
    const conditions = ['1=1'];
    const params = [];
    let idx = 1;

    if (action) { conditions.push(`al.action = :${idx++}`); params.push(action); }
    if (from) { conditions.push(`al.created_at >= TO_DATE(:${idx++}, 'YYYY-MM-DD')`); params.push(from); }
    if (to) { conditions.push(`al.created_at <= TO_DATE(:${idx++}, 'YYYY-MM-DD') + 1`); params.push(to); }

    const where = conditions.join(' AND ');
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    const { rows } = await query(
      `SELECT al.id, al.actor_id, al.action, al.entity_type, al.entity_id, al.details_json, al.ip, al.created_at,
              u.display_name AS actor_name
       FROM audit_log al
       LEFT JOIN users u ON al.actor_id = u.id
       WHERE ${where}
       ORDER BY al.created_at DESC
       OFFSET :${idx++} ROWS FETCH NEXT :${idx++} ROWS ONLY`,
      [...params, offsetNum, limitNum]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM audit_log al WHERE ${where}`,
      params
    );

    res.json({ data: rows, total: parseInt(countRows[0]?.TOTAL || countRows[0]?.total || 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
