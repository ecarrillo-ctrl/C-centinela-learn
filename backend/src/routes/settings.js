import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';
import { upload } from '../middleware/upload.js';
import { uploadFile, getPresignedUrl } from '../services/storage-service.js';
import path from 'node:path';

const router = Router();

router.use(authenticateToken, requireAdmin);

// ============ ADMIN USER MANAGEMENT ============

router.put('/users/:id/admin', async (req, res) => {
  try {
    const { isAdmin } = req.body;
    const adminVal = isAdmin ? 1 : 0;

    await query('UPDATE users SET is_admin = :1 WHERE id = :2', [adminVal, req.params.id]);

    const { rows } = await query(
      'SELECT id, email, display_name, is_admin FROM users WHERE id = :1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json)
       VALUES (:1, :2, 'user', :3, :4)`,
      [req.user.id, isAdmin ? 'user_promote_admin' : 'user_demote_admin', req.params.id,
      JSON.stringify({ email: rows[0].EMAIL || rows[0].email })]
    );

    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/deactivate', async (req, res) => {
  try {
    await query(
      "UPDATE users SET status = 'inactive', deactivated_at = SYSTIMESTAMP WHERE id = :1",
      [req.params.id]
    );

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id)
       VALUES (:1, 'user_deactivate', 'user', :2)`,
      [req.user.id, req.params.id]
    );

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/reactivate', async (req, res) => {
  try {
    await query(
      "UPDATE users SET status = 'active', deactivated_at = NULL WHERE id = :1",
      [req.params.id]
    );

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id)
       VALUES (:1, 'user_reactivate', 'user', :2)`,
      [req.user.id, req.params.id]
    );

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ LOGO UPLOAD (S3) ============

router.post('/settings/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo de logo requerido' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
      return res.status(400).json({ error: 'Solo PNG, JPG o SVG' });
    }

    const contentType = ext === '.svg' ? 'image/svg+xml' : `image/${ext.replace('.', '')}`;
    const s3Key = `branding/logo${ext}`;

    await uploadFile(s3Key, req.file.buffer, contentType);

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, details_json)
       VALUES (:1, 'logo_upload', 'settings', :2)`,
      [req.user.id, JSON.stringify({ filename: req.file.originalname, s3Key })]
    );

    res.json({ success: true, url: '/api/admin/settings/logo' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/settings/logo', async (_req, res) => {
  try {
    const url = await getPresignedUrl('branding/logo.png', 3600);
    res.redirect(302, url);
  } catch (err) {
    res.status(404).json({ error: 'Logo no configurado' });
  }
});

// ============ FIRMA PARA DIPLOMAS (S3) ============

router.post('/settings/signature', upload.single('signature'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo de firma requerido' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
      return res.status(400).json({ error: 'Solo PNG o JPG' });
    }

    const contentType = `image/${ext.replace('.', '').replace('jpg', 'jpeg')}`;
    // Siempre se guarda como .png (pdfkit acepta PNG/JPEG por contenido, no por extensión del key)
    await uploadFile('branding/signature.png', req.file.buffer, contentType);

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, details_json)
       VALUES (:1, 'signature_upload', 'settings', :2)`,
      [req.user.id, JSON.stringify({ filename: req.file.originalname })]
    );

    res.json({ success: true, url: '/api/admin/settings/signature' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/settings/signature', async (_req, res) => {
  try {
    const url = await getPresignedUrl('branding/signature.png', 3600);
    res.redirect(302, url);
  } catch (err) {
    res.status(404).json({ error: 'Firma no configurada' });
  }
});

// ============ ORGANIZATIONS ============

router.get('/organizations', async (_req, res) => {
  try {
    const { rows } = await query('SELECT id, name, country, is_active FROM organizations ORDER BY name');
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
