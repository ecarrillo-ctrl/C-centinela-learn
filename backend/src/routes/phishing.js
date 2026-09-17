import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createTemplateSchema, createCampaignSchema, smartGroupPreviewSchema, pabReportSchema } from '../schemas/phishing.js';
import { query } from '../db.js';
import { applyRiskEvent, markPhishProne } from '../services/risk-engine.js';
import {
  generateTrackingToken, decodeTrackingToken,
  getSmartGroupRecipients, sendPhishingCampaign, trackEvent,
} from '../services/phishing-service.js';

const router = Router();

// ============ TEMPLATES (admin) ============
router.get('/admin/phishing/templates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, subject, html_body, text_body, red_flags_json, difficulty, category, created_by, created_at FROM phishing_templates WHERE is_active = 1 ORDER BY created_at DESC'
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/phishing/templates', authenticateToken, requireAdmin, validate(createTemplateSchema), async (req, res) => {
  try {
    const { name, subject, html_body, text_body, red_flags, difficulty, category } = req.body;

    await query(
      `INSERT INTO phishing_templates (name, subject, html_body, text_body, red_flags_json, difficulty, category, created_by)
       VALUES (:1, :2, :3, :4, :5, :6, :7, :8)`,
      [name, subject, html_body, text_body || null, JSON.stringify(red_flags || []), difficulty || 'medium', category || null, req.user.id]
    );

    const { rows } = await query(
      `SELECT id, name, subject, difficulty, category, created_at FROM phishing_templates
       WHERE name = :1 AND created_by = :2 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [name, req.user.id]
    );

    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json) VALUES ($1, 'phishing_template_create', 'phishing_template', $2, $3)",
      [req.user.id, rows[0].id, JSON.stringify({ name })]
    );

    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/phishing/templates/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rowsAffected } = await query(
      "UPDATE phishing_templates SET is_active = 0 WHERE id = $1",
      [req.params.id]
    );
    if (rowsAffected === 0) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CAMPAIGNS (admin) ============
router.get('/admin/phishing/campaigns', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT pc.*, pt.name AS template_name, pt.subject AS template_subject,
        (SELECT count(*) FROM phishing_results pr WHERE pr.campaign_id = pc.id) AS event_count,
        (SELECT count(*) FROM phishing_results pr WHERE pr.campaign_id = pc.id AND pr.event = 'clicked') AS click_count
       FROM phishing_campaigns pc
       JOIN phishing_templates pt ON pc.template_id = pt.id
       ORDER BY pc.created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/phishing/campaigns', authenticateToken, requireAdmin, validate(createCampaignSchema), async (req, res) => {
  try {
    const { name, template_id, smart_group_rule, org_unit_scope, targets } = req.body;

    // targets = { user_ids: [], ou_ids: [], group_ids: [] }
    const targetJson = targets ? JSON.stringify(targets) : null;

    await query(
      `INSERT INTO phishing_campaigns (name, template_id, org_unit_scope, smart_group_rule, status, created_by)
       VALUES (:1, :2, :3, :4, 'draft', :5)`,
      [name, template_id, org_unit_scope || null, targetJson || JSON.stringify(smart_group_rule || null), req.user.id]
    );

    const { rows } = await query(
      `SELECT id, name, template_id, status, created_at FROM phishing_campaigns
       WHERE name = :1 AND created_by = :2 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [name, req.user.id]
    );

    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json) VALUES ($1, 'phishing_campaign_create', 'phishing_campaign', $2, $3)",
      [req.user.id, rows[0].id, JSON.stringify({ name })]
    );

    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/phishing/campaigns/:id/send', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await sendPhishingCampaign(req.params.id);

    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json) VALUES ($1, 'phishing_campaign_send', 'phishing_campaign', $2, $3)",
      [req.user.id, req.params.id, JSON.stringify({ authorized_by: req.user.id, ...result })]
    );

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar campaña (solo draft)
router.put('/admin/phishing/campaigns/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, template_id, org_unit_scope, smart_group_rule } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;

    if (name) { sets.push(`name = :${idx++}`); params.push(name); }
    if (template_id) { sets.push(`template_id = :${idx++}`); params.push(template_id); }
    if (org_unit_scope !== undefined) { sets.push(`org_unit_scope = :${idx++}`); params.push(org_unit_scope || null); }
    if (smart_group_rule !== undefined) { sets.push(`smart_group_rule = :${idx++}`); params.push(JSON.stringify(smart_group_rule)); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    const { rowsAffected } = await query(
      `UPDATE phishing_campaigns SET ${sets.join(', ')} WHERE id = :${idx} AND status = 'draft'`,
      [...params, req.params.id]
    );

    if (rowsAffected === 0) return res.status(404).json({ error: 'Campaña no encontrada o ya enviada' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Eliminar campaña
router.delete('/admin/phishing/campaigns/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Solo eliminar draft campaigns; completed campaigns se conservan para historial
    await query('DELETE FROM phishing_results WHERE campaign_id = :1', [req.params.id]);
    const { rowsAffected } = await query('DELETE FROM phishing_campaigns WHERE id = :1', [req.params.id]);
    if (rowsAffected === 0) return res.status(404).json({ error: 'Campaña no encontrada' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/phishing/campaigns/:id/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT event, count(*) AS count FROM phishing_results
       WHERE campaign_id = $1 GROUP BY event`,
      [req.params.id]
    );
    const stats = {};
    for (const row of rows) stats[row.event] = parseInt(row.count);

    const { rows: totalRow } = await query(
      'SELECT count(DISTINCT user_id) AS total FROM phishing_results WHERE campaign_id = $1',
      [req.params.id]
    );

    res.json({ campaign_id: req.params.id, total_recipients: totalRow[0]?.total || 0, events: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SMART GROUP PREVIEW (admin) ============
router.post('/admin/phishing/smart-group-preview', authenticateToken, requireAdmin, validate(smartGroupPreviewSchema), async (req, res) => {
  try {
    const recipients = await getSmartGroupRecipients(req.body);
    res.json({ count: recipients.length, recipients: recipients.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ PUBLIC TRACKING ============
router.get('/phish/track', async (req, res) => {
  try {
    const { t } = req.query;
    if (!t) return res.status(400).send('Token requerido');

    const decoded = decodeTrackingToken(t);
    if (!decoded) return res.status(400).send('Token inválido');

    const { userId, campaignId } = decoded;

    const success = await trackEvent(userId, campaignId, 'clicked', req.ip, req.headers['user-agent'] || null);

    if (success) {
      console.log(`[PHISH] Click tracked: user=${userId}, campaign=${campaignId}`);
    }

    res.redirect(`/api/phish/landing/${campaignId}`);
  } catch (err) {
    console.error('[PHISH-TRACK] Error:', err.message);
    res.status(500).send('Error interno');
  }
});

router.get('/phish/open', async (req, res) => {
  try {
    const { t } = req.query;
    if (!t) {
      res.setHeader('Content-Type', 'image/gif');
      return res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }

    const decoded = decodeTrackingToken(t);
    if (!decoded) {
      res.setHeader('Content-Type', 'image/gif');
      return res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }

    await query(
      `MERGE INTO phishing_results pr
       USING (SELECT :1 AS user_id, :2 AS campaign_id, 'opened' AS event FROM DUAL) src
       ON (pr.user_id = src.user_id AND pr.campaign_id = src.campaign_id AND pr.event = src.event)
       WHEN NOT MATCHED THEN
         INSERT (user_id, campaign_id, event, ip, user_agent)
         VALUES (src.user_id, src.campaign_id, src.event, :3, :4)`,
      [decoded.userId, decoded.campaignId, req.ip, req.headers['user-agent'] || null]
    );

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  } catch (err) {
    res.setHeader('Content-Type', 'image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  }
});

// ============ LANDING EDUCATIVA ============
router.get('/phish/landing/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const { rows: campaigns } = await query(
      `SELECT pc.*, pt.name AS template_name, pt.subject, pt.html_body, pt.red_flags_json, pt.category
       FROM phishing_campaigns pc
       JOIN phishing_templates pt ON pc.template_id = pt.id
       WHERE pc.id = $1`,
      [campaignId]
    );

    if (campaigns.length === 0) {
      return res.status(404).send('<h1>Campaña no encontrada</h1>');
    }

    const campaign = campaigns[0];
    let flags = [];
    try { flags = JSON.parse(campaign.red_flags_json || '[]'); } catch { flags = []; }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>eLearning AgroAmérica — ¡Alerta de Seguridad!</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f5f5f0; color: #333; line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; padding: 20px; }
  .header { background: #001B71; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
  .header h1 { font-family: 'Georgia', 'Times New Roman', serif; font-size: 1.8em; margin-bottom: 8px; }
  .header p { opacity: 0.9; }
  .content { background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  .warning h2 { color: #856404; font-size: 1.3em; margin-bottom: 8px; }
  .email-preview { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  .email-preview .subject { font-weight: bold; margin-bottom: 10px; color: #001B71; }
  .email-preview .body { color: #555; }
  .red-flags { margin-bottom: 20px; }
  .red-flags h3 { color: #dc3545; margin-bottom: 12px; font-size: 1.1em; }
  .flag { background: #f8d7da; border-left: 4px solid #dc3545; padding: 12px 16px; margin-bottom: 8px; border-radius: 4px; }
  .flag .indicator { font-weight: bold; color: #721c24; }
  .flag .description { color: #856404; font-size: 0.95em; }
  .tips { background: #d4edda; border: 1px solid #28a745; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  .tips h3 { color: #155724; margin-bottom: 10px; }
  .tips ul { padding-left: 20px; color: #155724; }
  .tips li { margin-bottom: 6px; }
  .actions { text-align: center; }
  .btn { display: inline-block; background: #00BC70; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 1.1em; transition: background 0.2s; }
  .btn:hover { background: #009d5e; }
  .btn-secondary { background: #2B5597; margin-left: 12px; }
  .btn-secondary:hover { background: #1d3f6f; }
  .footer { text-align: center; margin-top: 30px; color: #888; font-size: 0.9em; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>eLearning AgroAmérica</h1>
      <p>Concientización en Ciberseguridad — AgroAmérica</p>
    </div>
    <div class="content">
      <div class="warning">
        <h2>¡Usted cayó en una simulación de phishing!</h2>
        <p>No se preocupe — este era un <strong>ejercicio de concientización autorizado</strong> por el equipo de seguridad de AgroAmérica. No se ha comprometido ninguna cuenta ni dato real.</p>
      </div>

      <div class="email-preview">
        <div class="subject">Asunto: ${campaign.subject}</div>
        <div class="body">${campaign.html_body.substring(0, 500)}</div>
      </div>

      ${flags.length > 0 ? `
      <div class="red-flags">
        <h3>Banderas rojas que ignoró (Social Engineering Indicators):</h3>
        ${flags.map(f => `
        <div class="flag">
          <div class="indicator">${f.indicator}</div>
          <div class="description">${f.description}</div>
        </div>`).join('')}
      </div>` : ''}

      <div class="tips">
        <h3>Consejos para identificar phishing:</h3>
        <ul>
          <li>Verifique siempre el remitente real del correo (no solo el nombre mostrado)</li>
          <li>Desconfíe de mensajes que generan urgencia o amenazas</li>
          <li>No haga clic en enlaces sospechosos — pase el cursor sobre ellos primero</li>
          <li>No abra adjuntos de remitentes desconocidos o inesperados</li>
          <li>Use el <strong>Phish Alert Button (PAB)</strong> para reportar correos sospechosos</li>
          <li>Ante la duda, contacte al equipo de TI por un canal diferente</li>
        </ul>
      </div>

      <div class="actions">
        <a href="/capacitacion" class="btn">Tomar microcapacitación</a>
        <a href="/pab" class="btn btn-secondary">Configurar PAB</a>
      </div>
    </div>
    <div class="footer">
      <p>eLearning AgroAmérica — Plataforma de Concientización AgroAmérica</p>
      <p>Este es un ejercicio autorizado de seguridad. Para preguntas, contacte a seguridad@agroamerica.com</p>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send('<h1>Error al cargar la página</h1>');
  }
});

// ============ PHISH ALERT BUTTON (PAB) ============
router.post('/pab/report', authenticateToken, validate(pabReportSchema), async (req, res) => {
  try {
    const { reported_subject, reported_from } = req.body;

    await query(
      `INSERT INTO pab_reports (user_id, reported_subject, reported_from, was_simulated)
       VALUES ($1, $2, $3, 0)`,
      [req.user.id, reported_subject, reported_from || null]
    );

    const { rows } = await query(
      `SELECT id FROM pab_reports WHERE user_id = $1 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [req.user.id]
    );

    const { rows: simulated } = await query(
      `SELECT pc.id, pc.name FROM phishing_campaigns pc
       JOIN phishing_templates pt ON pc.template_id = pt.id
       WHERE pt.subject = $1 AND pc.status = 'completed'
       ORDER BY pc.sent_at DESC FETCH FIRST 1 ROWS ONLY`,
      [reported_subject]
    );

    if (simulated.length > 0) {
      await query(
        "UPDATE pab_reports SET was_simulated = 1, campaign_id = $1 WHERE id = $2",
        [simulated[0].id, rows[0].id]
      );

      const { rows: alreadyClicked } = await query(
        "SELECT 1 FROM phishing_results WHERE user_id = $1 AND campaign_id = $2 AND event = 'clicked'",
        [req.user.id, simulated[0].id]
      );

      if (alreadyClicked.length === 0) {
        await trackEvent(req.user.id, simulated[0].id, 'reported', req.ip, req.headers['user-agent'] || null);
        await applyRiskEvent(req.user.id, -10, 'Reporte de phishing con PAB (simulado)', 'pab', rows[0].id);
      }

      return res.json({
        success: true,
        message: '¡Excelente! Usted reportó un correo de phishing simulado.',
        was_simulated: true,
        detected: true,
      });
    }

    await applyRiskEvent(req.user.id, -5, 'Reporte de correo sospechoso real con PAB', 'pab', rows[0].id);

    res.json({
      success: true,
      message: 'Gracias por reportar este correo. El equipo de seguridad lo revisará.',
      was_simulated: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ USER: Mi conteo de PAB reports ============
router.get('/pab/my-stats', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT COUNT(*) AS total_reports FROM pab_reports WHERE user_id = :1',
      [req.user.id]
    );
    res.json({ total_pab_reports: parseInt(rows[0]?.total_reports || 0, 10) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
