import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';
import { refreshMaterializedViews } from '../services/risk-engine.js';
import PDFDocument from 'pdfkit';

const router = Router();
router.use(authenticateToken, requireAdmin);

router.get('/analytics/risk', async (req, res) => {
  try {
    const { scope = 'user', ou, limit = 50 } = req.query;

    if (scope === 'user') {
      const { rows } = await query(
        `SELECT u.id, u.display_name, u.email, u.risk_score, u.phish_prone,
                ou.name AS org_unit_name, o.name AS org_name
         FROM users u
         LEFT JOIN org_units ou ON u.org_unit_id = ou.id
         LEFT JOIN organizations o ON ou.organization_id = o.id
         WHERE u.status = 'active'
         ORDER BY u.risk_score DESC
         FETCH FIRST :1 ROWS ONLY`,
        [parseInt(limit, 10)]
      );
      return res.json({ scope: 'user', data: rows });
    }

    if (scope === 'ou') {
      const params = ou ? [ou] : [];
      const where = ou ? 'WHERE org_unit_id = :1' : '';
      const { rows } = await query(
        `SELECT org_unit_id, org_unit_name, organization_id, total_users, active_users,
                avg_risk_score, phish_prone_count, phish_prone_pct
         FROM mv_ou_risk ${where} ORDER BY avg_risk_score DESC`,
        params
      );
      return res.json({ scope: 'ou', data: rows });
    }

    if (scope === 'org') {
      const { rows } = await query(
        `SELECT organization_id, organization_name, total_users, active_users,
                avg_risk_score, phish_prone_count, phish_prone_pct
         FROM mv_org_risk ORDER BY avg_risk_score DESC`
      );
      return res.json({ scope: 'org', data: rows });
    }

    return res.status(400).json({ error: 'Scope invalido: use user, ou, o org' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/analytics/phish-prone', async (req, res) => {
  try {
    const { rows: campaigns } = await query(
      `SELECT pc.id, pc.name, pc.sent_at, pc.org_unit_scope,
              SUM(CASE WHEN pr.event = 'clicked' THEN 1 ELSE 0 END) AS clickers,
              COUNT(DISTINCT pr.user_id) AS total_recipients
       FROM phishing_campaigns pc
       LEFT JOIN phishing_results pr ON pr.campaign_id = pc.id
       WHERE pc.sent_at IS NOT NULL
       GROUP BY pc.id, pc.name, pc.sent_at, pc.org_unit_scope
       ORDER BY pc.sent_at ASC`
    );

    const { rows: currentStats } = await query(
      `SELECT
        ROUND(SUM(CASE WHEN u.phish_prone = 1 AND u.status = 'active' THEN 1 ELSE 0 END) * 100.0
          / NULLIF(SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END), 0), 2) AS current_pct,
        SUM(CASE WHEN u.status = 'active' AND u.phish_prone = 1 THEN 1 ELSE 0 END) AS prone_count,
        SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) AS total_active
       FROM users u`
    );

    res.json({
      campaigns: campaigns.map(c => ({
        ...c,
        click_rate: parseInt(c.TOTAL_RECIPIENTS || c.total_recipients || 0) > 0
          ? Math.round((parseInt(c.CLICKERS || c.clickers || 0) / parseInt(c.TOTAL_RECIPIENTS || c.total_recipients)) * 10000) / 100
          : 0,
      })),
      current: currentStats[0] || { current_pct: 0, prone_count: 0, total_active: 0 },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/analytics/training-progress', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT org_unit_id, org_unit_name, organization_id, users_enrolled,
              total_enrollments, completed, completion_rate_pct, avg_progress_pct
       FROM mv_training_progress
       ORDER BY completion_rate_pct ASC`
    );

    const { rows: summary } = await query(
      `SELECT
        SUM(CASE WHEN te.status = 'assigned' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN te.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN te.status = 'completed' THEN 1 ELSE 0 END) AS completed,
        ROUND(SUM(CASE WHEN te.status = 'completed' THEN 1 ELSE 0 END) * 100.0
          / NULLIF(COUNT(*), 0), 2) AS overall_pct
       FROM training_enrollments te
       JOIN users u ON te.user_id = u.id
       WHERE u.status = 'active'`
    );

    res.json({ by_ou: rows, summary: summary[0] || { assigned: 0, in_progress: 0, completed: 0, overall_pct: 0 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/analytics/top-clickers', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const { rows } = await query(
      `SELECT u.id, u.display_name, u.email, u.risk_score, u.phish_prone,
              ou.name AS org_unit_name,
              SUM(CASE WHEN pr.event = 'clicked' THEN 1 ELSE 0 END) AS total_clicks,
              SUM(CASE WHEN pr.event = 'opened' THEN 1 ELSE 0 END) AS total_opens,
              SUM(CASE WHEN pr.event = 'reported' THEN 1 ELSE 0 END) AS total_reports,
              MAX(pr.event_at) AS last_phish_event
       FROM users u
       LEFT JOIN org_units ou ON u.org_unit_id = ou.id
       LEFT JOIN phishing_results pr ON pr.user_id = u.id
       WHERE u.status = 'active'
       GROUP BY u.id, u.display_name, u.email, u.risk_score, u.phish_prone, ou.name
       HAVING SUM(CASE WHEN pr.event = 'clicked' THEN 1 ELSE 0 END) > 0
       ORDER BY total_clicks DESC, u.risk_score DESC
       FETCH FIRST :1 ROWS ONLY`,
      [parseInt(limit, 10)]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/analytics/heatmap', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT ou.id AS org_unit_id, ou.name AS org_unit_name,
              pc.id AS campaign_id, pc.name AS campaign_name, pt.category AS threat_type,
              COUNT(DISTINCT pr.user_id) AS total_recipients,
              COUNT(DISTINCT CASE WHEN pr.event = 'clicked' THEN pr.user_id END) AS clickers,
              ROUND(COUNT(DISTINCT CASE WHEN pr.event = 'clicked' THEN pr.user_id END) * 100.0
                / NULLIF(COUNT(DISTINCT pr.user_id), 0), 2) AS click_rate
       FROM phishing_campaigns pc
       JOIN phishing_templates pt ON pc.template_id = pt.id
       JOIN phishing_results pr ON pr.campaign_id = pc.id
       LEFT JOIN users u ON pr.user_id = u.id
       LEFT JOIN org_units ou ON u.org_unit_id = ou.id
       WHERE pr.event IN ('delivered', 'clicked', 'opened')
       GROUP BY ou.id, ou.name, pc.id, pc.name, pt.category
       ORDER BY click_rate DESC`
    );

    const heatmap = {};
    for (const row of rows) {
      const ouName = row.ORG_UNIT_NAME || row.org_unit_name || 'Sin OU';
      const threat = row.THREAT_TYPE || row.threat_type || 'General';
      if (!heatmap[ouName]) heatmap[ouName] = {};
      heatmap[ouName][threat] = {
        click_rate: parseFloat(row.CLICK_RATE || row.click_rate || 0),
        clickers: parseInt(row.CLICKERS || row.clickers || 0),
        total: parseInt(row.TOTAL_RECIPIENTS || row.total_recipients || 0),
      };
    }
    res.json({ data: heatmap });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/analytics/refresh-views', async (_req, res) => {
  try {
    await refreshMaterializedViews();
    res.json({ success: true, message: 'Vistas materializadas refrescadas' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/analytics/report', async (_req, res) => {
  try {
    const { rows: ouData } = await query(
      `SELECT org_unit_name, total_users, active_users, avg_risk_score, phish_prone_pct
       FROM mv_ou_risk ORDER BY avg_risk_score DESC`
    );

    const { rows: topClickers } = await query(
      `SELECT u.display_name, ou.name AS ou_name, u.risk_score,
              SUM(CASE WHEN pr.event = 'clicked' THEN 1 ELSE 0 END) AS clicks
       FROM users u
       LEFT JOIN org_units ou ON u.org_unit_id = ou.id
       LEFT JOIN phishing_results pr ON pr.user_id = u.id
       WHERE u.status = 'active'
       GROUP BY u.id, u.display_name, ou.name, u.risk_score
       HAVING SUM(CASE WHEN pr.event = 'clicked' THEN 1 ELSE 0 END) > 0
       ORDER BY clicks DESC
       FETCH FIRST 10 ROWS ONLY`
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="RPT-LEARN-${new Date().toISOString().slice(0, 10)}.pdf"`);
      res.send(pdf);
    });

    const navy = '#001B71';
    doc.rect(0, 0, doc.page.width, 80).fill(navy);
    doc.fill('white').font('Helvetica-Bold').fontSize(22)
      .text('eLearning AgroAmérica', 50, 25).fontSize(10).font('Helvetica')
      .text('Reporte Ejecutivo de Concientizacion — AgroAmérica', 50, 53);

    const today = new Date().toISOString().slice(0, 10);
    doc.moveDown(5);
    doc.fill(navy).font('Helvetica-Bold').fontSize(14).text(`Resumen de Riesgo — ${today}`, { underline: true });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10);

    const headers = ['Unidad Organizacional', 'Usuarios', 'Activos', 'Risk Score', 'Phish Prone %'];
    const colWidths = [200, 60, 50, 70, 80];
    let y = doc.y + 5;
    doc.rect(50, y, doc.page.width - 100, 20).fill(navy);
    doc.fill('white');
    let xPos = 55;
    headers.forEach((h, i) => { doc.text(h, xPos, y + 5, { width: colWidths[i] }); xPos += colWidths[i]; });
    doc.fill(navy);
    y += 22;

    for (const row of ouData) {
      if (y > 700) { doc.addPage(); y = 50; }
      const ouName = row.ORG_UNIT_NAME || row.org_unit_name || '—';
      const vals = [ouName, String(row.TOTAL_USERS || row.total_users || 0), String(row.ACTIVE_USERS || row.active_users || 0),
        String(row.AVG_RISK_SCORE || row.avg_risk_score || '0'), `${row.PHISH_PRONE_PCT || row.phish_prone_pct || '0'}%`];
      let x2 = 55;
      vals.forEach((v, i) => { doc.fill('#333').text(v, x2, y, { width: colWidths[i] }); x2 += colWidths[i]; });
      y += 18;
    }

    if (topClickers.length > 0) {
      doc.moveDown(2);
      doc.fill(navy).font('Helvetica-Bold').fontSize(14).text('Top Clickers', { underline: true });
      doc.moveDown(0.5).font('Helvetica').fontSize(10);
      for (const tc of topClickers) {
        const name = tc.DISPLAY_NAME || tc.display_name;
        const ou = tc.OU_NAME || tc.ou_name || '—';
        const clicks = tc.CLICKS || tc.clicks;
        const score = tc.RISK_SCORE || tc.risk_score;
        doc.text(`${name} (${ou}) — ${clicks} clicks — Score: ${score}`);
      }
    }

    doc.moveDown(2);
    doc.fontSize(8).fill('#888').text(`Generado por eLearning AgroAmérica — ${new Date().toLocaleString('es-GT')} — AgroAmérica`, { align: 'center' });
    doc.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
