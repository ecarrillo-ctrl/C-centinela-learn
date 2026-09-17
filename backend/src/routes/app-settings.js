import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';

const router = Router();
router.use(authenticateToken, requireAdmin);

// ============ GET: Obtener settings por categoría ============
router.get('/settings', async (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT id, setting_key, setting_value, category, updated_at FROM app_settings';
    const params = [];

    if (category) {
      sql += ' WHERE category = :1';
      params.push(category);
    }

    sql += ' ORDER BY category, setting_key';
    const { rows } = await query(sql, params);

    // Convertir a mapa key-value agrupado por categoría
    const grouped = {};
    for (const r of rows) {
      const cat = r.category || r.CATEGORY || 'general';
      if (!grouped[cat]) grouped[cat] = {};
      grouped[cat][r.setting_key || r.SETTING_KEY] = r.setting_value || r.SETTING_VALUE || '';
    }

    res.json({ data: grouped, raw: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ GET: Obtener un setting específico ============
router.get('/settings/:key', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT setting_key, setting_value, category, updated_at FROM app_settings WHERE setting_key = :1',
      [req.params.key]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Setting no encontrado' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ PUT: Actualizar settings (batch) ============
router.put('/settings', async (req, res) => {
  try {
    const { settings } = req.body; // [{key, value}] o {key: value}
    if (!settings) return res.status(400).json({ error: 'settings es requerido' });

    let pairs = [];
    if (Array.isArray(settings)) {
      pairs = settings.map(s => ({ key: s.key, value: s.value }));
    } else if (typeof settings === 'object') {
      pairs = Object.entries(settings).map(([key, value]) => ({ key, value }));
    }

    let updated = 0;
    for (const { key, value } of pairs) {
      const result = await query(
        `MERGE INTO app_settings a
         USING (SELECT :1 AS setting_key FROM DUAL) src
         ON (a.setting_key = src.setting_key)
         WHEN MATCHED THEN UPDATE SET setting_value = :2, updated_by = :3
         WHEN NOT MATCHED THEN INSERT (setting_key, setting_value, category, updated_by) VALUES (:4, :5, 'general', :6)`,
        [key, String(value), req.user.id, key, String(value), req.user.id]
      );
      updated++;
    }

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, details_json, ip)
       VALUES (:1, 'settings_update', 'settings', :2, :3)`,
      [req.user.id, JSON.stringify({ keys: pairs.map(p => p.key) }), req.ip || '']
    );

    res.json({ success: true, updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ PUT: Actualizar un solo setting ============
router.put('/settings/:key', async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: 'value es requerido' });

    await query(
      `MERGE INTO app_settings a
       USING (SELECT :1 AS setting_key FROM DUAL) src
       ON (a.setting_key = src.setting_key)
       WHEN MATCHED THEN UPDATE SET setting_value = :2, updated_by = :3
       WHEN NOT MATCHED THEN INSERT (setting_key, setting_value, category, updated_by) VALUES (:4, :5, 'general', :6)`,
      [req.params.key, String(value), req.user.id, req.params.key, String(value), req.user.id]
    );

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
