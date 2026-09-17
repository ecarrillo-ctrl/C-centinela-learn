import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { query } from '../db.js';
import { computeDelta, applyRiskEvent, markPhishProne } from './risk-engine.js';
import { getSmtpConfig } from './mailer.js';

// Singleton transporter — se recrea si cambia el host/puerto configurado en
// Ajustes > Integraciones (o las variables de entorno, como respaldo). El
// rate limit alto (bulk) es propio de este módulo, no se comparte con mailer.js.
let _transporter = null;
let _cacheKey = null;

async function getTransporter() {
  const cfg = await getSmtpConfig();
  const cacheKey = `${cfg.host}:${cfg.port}`;
  if (_transporter && _cacheKey === cacheKey) return _transporter;

  _transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: process.env.SMTP_SECURE === 'true',
    ...(process.env.SMTP_USER ? {
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    } : {}),
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateLimit: 10,
  });
  _cacheKey = cacheKey;
  return _transporter;
}

export function generateTrackingToken(userId, campaignId) {
  const payload = `${userId}:${campaignId}:${crypto.randomBytes(16).toString('hex')}`;
  return Buffer.from(payload).toString('base64url');
}

export function decodeTrackingToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const [userId, campaignId] = decoded.split(':');
    return { userId, campaignId };
  } catch {
    return null;
  }
}

export async function getSmartGroupRecipients(rule) {
  if (!rule) return [];

  const conditions = ['u.status = $1'];
  const params = ['active'];
  let idx = 2;

  if (rule.org_unit_id) {
    conditions.push(`u.org_unit_id = $${idx++}`);
    params.push(rule.org_unit_id);
  }

  if (rule.min_risk_score !== undefined) {
    conditions.push(`u.risk_score >= $${idx++}`);
    params.push(rule.min_risk_score);
  }

  if (rule.max_risk_score !== undefined) {
    conditions.push(`u.risk_score <= $${idx++}`);
    params.push(rule.max_risk_score);
  }

  if (rule.phish_prone === true) {
    conditions.push('u.phish_prone = 1');
  }

  if (rule.fell_in_last_campaign && rule.last_campaign_id) {
    conditions.push(`EXISTS (
      SELECT 1 FROM phishing_results pr2
      WHERE pr2.user_id = u.id AND pr2.campaign_id = $${idx++} AND pr2.event = 'clicked'
    )`);
    params.push(rule.last_campaign_id);
  }

  if (rule.exclude_recent_reporters && rule.last_campaign_id) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM phishing_results pr3
      WHERE pr3.user_id = u.id AND pr3.campaign_id = $${idx++} AND pr3.event = 'reported'
    )`);
    params.push(rule.last_campaign_id);
  }

  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, u.first_name FROM users u
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.email`,
    params
  );

  return rows;
}

export async function trackEvent(userId, campaignId, event, ip = null, userAgent = null) {
  const token = generateTrackingToken(userId, campaignId);

  // MERGE para simular ON CONFLICT DO NOTHING
  const { rowsAffected } = await query(
    `MERGE INTO phishing_results pr
     USING (SELECT :1 AS user_id, :2 AS campaign_id, :3 AS event FROM DUAL) src
     ON (pr.user_id = src.user_id AND pr.campaign_id = src.campaign_id AND pr.event = src.event)
     WHEN NOT MATCHED THEN
       INSERT (user_id, campaign_id, event, ip, user_agent, tracking_token)
       VALUES (src.user_id, src.campaign_id, src.event, :4, :5, :6)`,
    [userId, campaignId, event, ip || null, userAgent || null, token]
  );

  if (rowsAffected > 0 && ['clicked', 'attachment_opened', 'data_entered'].includes(event)) {
    const ruleKey = `phishing_${event}`;
    const { delta, reason, source } = computeDelta(ruleKey);
    await applyRiskEvent(userId, delta, reason, source, null);
    await markPhishProne(userId, campaignId);
  }

  return rowsAffected > 0;
}

export async function sendPhishingCampaign(campaignId) {
  const { rows: campaigns } = await query(
    `SELECT pc.*, pt.name AS template_name, pt.subject, pt.html_body, pt.red_flags_json,
            cp.lookalike_url AS corporate_page_lookalike_url
     FROM phishing_campaigns pc
     JOIN phishing_templates pt ON pc.template_id = pt.id
     LEFT JOIN phishing_corporate_pages cp ON pc.corporate_page_id = cp.id
     WHERE pc.id = $1 AND pc.status = 'draft'`,
    [campaignId]
  );

  if (campaigns.length === 0) {
    throw new Error('Campaña no encontrada o ya enviada');
  }

  const campaign = campaigns[0];

  // Resolve recipients from targets
  let recipients = [];
  let targetData = null;
  try { targetData = typeof campaign.smart_group_rule === 'string' ? JSON.parse(campaign.smart_group_rule) : campaign.smart_group_rule; } catch { }

  if (targetData && (targetData.user_ids || targetData.ou_ids || targetData.group_ids)) {
    recipients = await resolveTargets(targetData);
  } else if (targetData && (targetData.org_unit_id || targetData.min_risk_score !== undefined)) {
    recipients = await getSmartGroupRecipients(targetData);
  } else {
    recipients = await getSmartGroupRecipients({ org_unit_id: campaign.org_unit_scope });
  }

  if (recipients.length === 0) {
    throw new Error('No se encontraron destinatarios para esta campaña');
  }

  const queue = [...recipients];
  const delayMs = Math.max(60 * 1000 / recipients.length, 200);

  let sent = 0;
  const errors = [];

  for (let i = 0; i < queue.length; i++) {
    const recipient = queue[i];
    const token = generateTrackingToken(recipient.id, campaignId);
    const trackUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/phish/track?t=${token}`;
    const openUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/phish/open?t=${token}`;

    const html = campaign.html_body.replace(
      '</body>',
      `<img src="${openUrl}" width="1" height="1" alt="" style="display:none" /></body>`
    );

    const personalizedHtml = html
      .replace(/{{firstName}}/g, recipient.first_name || '')
      .replace(/{{displayName}}/g, recipient.display_name || '')
      .replace(/{{email}}/g, recipient.email)
      .replace(/{{trackingUrl}}/g, trackUrl)
      .replace(/{{lookalikeUrl}}/g, campaign.corporate_page_lookalike_url || '');

    try {
      await sendEmail(recipient.email, campaign.subject, personalizedHtml);
      sent++;
      await trackEvent(recipient.id, campaignId, 'delivered');
    } catch (err) {
      errors.push({ email: recipient.email, error: err.message });
    }

    if (i < queue.length - 1) {
      const jitter = Math.random() * delayMs;
      await new Promise(r => setTimeout(r, delayMs * 0.5 + jitter));
    }
  }

  await query(
    `UPDATE phishing_campaigns SET status = 'completed', sent_at = SYSTIMESTAMP WHERE id = $1`,
    [campaignId]
  );

  return { sent, total: recipients.length, errors };
}

async function sendEmail(to, subject, html) {
  try {
    const [transporter, cfg] = await Promise.all([getTransporter(), getSmtpConfig()]);
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error(`[PHISHING] Error sending to ${to}:`, err.message);
    throw err;
  }
}

/**
 * Envía un correo de prueba de una campaña (en cualquier estado, no solo
 * 'draft') a un usuario específico — normalmente el admin que la está
 * armando. Usa exactamente el mismo armado de HTML y el mismo token de
 * tracking real que un envío normal, para poder validar de punta a punta
 * (incluida la pantalla de precaución al dar clic).
 */
export async function sendTestEmail(campaignId, testUserId) {
  const { rows: campaigns } = await query(
    `SELECT pc.*, pt.subject, pt.html_body,
            cp.lookalike_url AS corporate_page_lookalike_url
     FROM phishing_campaigns pc
     JOIN phishing_templates pt ON pc.template_id = pt.id
     LEFT JOIN phishing_corporate_pages cp ON pc.corporate_page_id = cp.id
     WHERE pc.id = $1`,
    [campaignId]
  );
  if (campaigns.length === 0) throw new Error('Campaña no encontrada');
  const campaign = campaigns[0];

  const { rows: users } = await query(
    'SELECT id, email, display_name, first_name FROM users WHERE id = :1',
    [testUserId]
  );
  if (users.length === 0) throw new Error('Usuario no encontrado');
  const recipient = users[0];

  const token = generateTrackingToken(recipient.id, campaignId);
  const trackUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/phish/track?t=${token}`;
  const openUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/phish/open?t=${token}`;

  const html = campaign.html_body.replace(
    '</body>',
    `<img src="${openUrl}" width="1" height="1" alt="" style="display:none" /></body>`
  );

  const personalizedHtml = html
    .replace(/{{firstName}}/g, recipient.first_name || '')
    .replace(/{{displayName}}/g, recipient.display_name || '')
    .replace(/{{email}}/g, recipient.email)
    .replace(/{{trackingUrl}}/g, trackUrl)
    .replace(/{{lookalikeUrl}}/g, campaign.corporate_page_lookalike_url || '');

  await sendEmail(recipient.email, `[PRUEBA] ${campaign.subject}`, personalizedHtml);

  return { sent_to: recipient.email };
}

/**
 * Resolve recipients from explicit targets:
 * { user_ids: [...], ou_ids: [...], group_ids: [...] }
 * Deduplicates by user ID.
 */
export async function resolveTargets(targets) {
  const userMap = new Map();

  // 1. Individual users
  if (targets.user_ids && targets.user_ids.length > 0) {
    for (const uid of targets.user_ids) {
      const { rows } = await query(
        "SELECT id, email, display_name, first_name FROM users WHERE id = :1 AND status = 'active'",
        [uid]
      );
      if (rows.length > 0) userMap.set(rows[0].id, rows[0]);
    }
  }

  // 2. OUs
  if (targets.ou_ids && targets.ou_ids.length > 0) {
    for (const ouId of targets.ou_ids) {
      const { rows } = await query(
        "SELECT id, email, display_name, first_name FROM users WHERE org_unit_id = :1 AND status = 'active'",
        [ouId]
      );
      for (const r of rows) userMap.set(r.id, r);
    }
  }

  // 3. Custom Groups
  if (targets.group_ids && targets.group_ids.length > 0) {
    for (const gid of targets.group_ids) {
      const { rows } = await query(
        `SELECT u.id, u.email, u.display_name, u.first_name
         FROM custom_group_members cgm
         JOIN users u ON cgm.user_id = u.id
         WHERE cgm.group_id = :1 AND u.status = 'active'`,
        [gid]
      );
      for (const r of rows) userMap.set(r.id, r);
    }
  }

  // If nothing was selected, get all active users
  if (userMap.size === 0 && !targets.user_ids?.length && !targets.ou_ids?.length && !targets.group_ids?.length) {
    const { rows } = await query(
      "SELECT id, email, display_name, first_name FROM users WHERE status = 'active'"
    );
    for (const r of rows) userMap.set(r.id, r);
  }

  return Array.from(userMap.values());
}
