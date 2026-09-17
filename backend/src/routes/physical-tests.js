import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ============ ADMIN: Listar pruebas físicas ============
router.get('/admin/physical-tests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (type) {
      conditions.push(`pt.test_type = :${idx++}`);
      params.push(type);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await query(
      `SELECT pt.id, pt.test_type, pt.name, pt.description, pt.location, pt.status,
              pt.tracking_code, pt.start_at, pt.end_at, pt.created_at,
              ou.name AS org_unit_name,
              u.display_name AS created_by_name,
              (SELECT COUNT(*) FROM physical_test_events pte WHERE pte.test_id = pt.id) AS event_count,
              (SELECT COUNT(DISTINCT pte.user_id) FROM physical_test_events pte WHERE pte.test_id = pt.id AND pte.user_id IS NOT NULL) AS unique_users
       FROM physical_tests pt
       LEFT JOIN org_units ou ON pt.org_unit_scope = ou.id
       LEFT JOIN users u ON pt.created_by = u.id
       ${where}
       ORDER BY pt.created_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ADMIN: Crear prueba física ============
router.post('/admin/physical-tests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { test_type, name, description, location, org_unit_scope, start_at, end_at } = req.body;
    if (!test_type || !name) return res.status(400).json({ error: 'test_type y name son requeridos' });
    if (!['usb', 'qr'].includes(test_type)) return res.status(400).json({ error: 'test_type debe ser usb o qr' });

    const trackingCode = `${test_type.toUpperCase()}-${uuidv4().substring(0, 8).toUpperCase()}`;

    await query(
      `INSERT INTO physical_tests (test_type, name, description, location, org_unit_scope, tracking_code, created_by, start_at, end_at)
       VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9)`,
      [
        test_type, name, description || '', location || '',
        org_unit_scope || null, trackingCode, req.user.id,
        start_at ? new Date(start_at) : null,
        end_at ? new Date(end_at) : null,
      ]
    );

    const { rows } = await query(
      'SELECT id FROM physical_tests WHERE tracking_code = :1',
      [trackingCode]
    );

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json)
       VALUES (:1, 'physical_test_create', 'physical_test', :2, :3)`,
      [req.user.id, rows[0]?.id, JSON.stringify({ test_type, name, tracking_code: trackingCode })]
    );

    res.json({ success: true, test: { id: rows[0]?.id, tracking_code: trackingCode } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ADMIN: Detalle de una prueba ============
router.get('/admin/physical-tests/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows: tests } = await query(
      `SELECT pt.*, ou.name AS org_unit_name, u.display_name AS created_by_name
       FROM physical_tests pt
       LEFT JOIN org_units ou ON pt.org_unit_scope = ou.id
       LEFT JOIN users u ON pt.created_by = u.id
       WHERE pt.id = :1`,
      [req.params.id]
    );
    if (tests.length === 0) return res.status(404).json({ error: 'Prueba no encontrada' });

    const { rows: events } = await query(
      `SELECT pte.id, pte.event_type, pte.ip, pte.user_agent, pte.location_detail, pte.created_at,
              u.display_name, u.email
       FROM physical_test_events pte
       LEFT JOIN users u ON pte.user_id = u.id
       WHERE pte.test_id = :1
       ORDER BY pte.created_at DESC`,
      [req.params.id]
    );

    res.json({ test: tests[0], events });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ADMIN: Finalizar prueba ============
router.put('/admin/physical-tests/:id/complete', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await query(
      "UPDATE physical_tests SET status = 'completed' WHERE id = :1",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ADMIN: Eliminar prueba ============
router.delete('/admin/physical-tests/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM physical_tests WHERE id = :1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ PUBLIC: Registrar evento (QR scan / USB connect) ============
router.post('/physical-test/track/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { rows: tests } = await query(
      "SELECT id, test_type FROM physical_tests WHERE tracking_code = :1 AND status = 'active'",
      [code]
    );

    if (tests.length === 0) {
      return res.status(404).json({ error: 'Prueba no encontrada o finalizada' });
    }

    const test = tests[0];
    const eventType = test.test_type === 'usb' ? 'usb_connected' : 'qr_scanned';

    await query(
      `INSERT INTO physical_test_events (test_id, event_type, ip, user_agent, location_detail)
       VALUES (:1, :2, :3, :4, :5)`,
      [test.id, eventType, req.ip, req.get('User-Agent') || '', req.body?.location_detail || '']
    );

    // Página educativa
    res.json({
      message: 'Este fue un ejercicio de concientización de seguridad.',
      educational: true,
      test_type: test.test_type,
      tips: test.test_type === 'usb'
        ? [
          'Nunca conecte dispositivos USB desconocidos a su computadora.',
          'Reporte cualquier USB encontrado al equipo de TI.',
          'Los atacantes usan USB infectados como vector de ataque.',
        ]
        : [
          'No escanee códigos QR de fuentes desconocidas.',
          'Verifique la URL antes de ingresar información.',
          'Reporte códigos QR sospechosos al equipo de seguridad.',
        ],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
