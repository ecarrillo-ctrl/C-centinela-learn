/**
 * eLearning AgroAmérica — Servicio de Notificaciones
 * Envía correos de vencimiento de capacitaciones a usuarios y jefes inmediatos.
 */
import nodemailer from 'nodemailer';
import { query } from '../db.js';

let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'mailhog',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      ...(process.env.SMTP_USER ? {
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      } : {}),
      pool: true,
      maxConnections: 3,
    });
  }
  return _transporter;
}

/**
 * Envía notificaciones de capacitaciones próximas a vencer.
 * El número de días se lee de app_settings (training_reminder_days, default 7).
 */
export async function notifyUpcomingDue() {
  // Read reminder days from settings
  let reminderDays = 7;
  try {
    const { rows: cfg } = await query("SELECT setting_value FROM app_settings WHERE setting_key = 'training_reminder_days'");
    if (cfg.length > 0) reminderDays = parseInt(cfg[0].setting_value || cfg[0].SETTING_VALUE || '7', 10);
  } catch { }

  const { rows } = await query(
    `SELECT te.id, te.user_id, te.course_id, te.status, tc.name AS campaign_name, tc.due_at,
            u.email, u.display_name, u.org_unit_id, u.status AS user_status,
            c.title AS course_title,
            ou.name AS org_unit_name
     FROM training_enrollments te
     JOIN users u ON te.user_id = u.id AND u.status = 'active'
     JOIN courses c ON te.course_id = c.id
     JOIN training_campaigns tc ON te.campaign_id = tc.id
     LEFT JOIN org_units ou ON u.org_unit_id = ou.id
     WHERE te.status != 'completed'
       AND tc.due_at IS NOT NULL
       AND tc.due_at BETWEEN SYSTIMESTAMP AND SYSTIMESTAMP + INTERVAL '` + reminderDays + `' DAY`
  );

  if (rows.length === 0) return { sent: 0, pending: 0, message: `No hay capacitaciones por vencer en los próximos ${reminderDays} días` };

  const transporter = getTransporter();
  let sent = 0;

  // Agrupar por usuario
  const byUser = {};
  for (const row of rows) {
    const email = row.email;
    if (!byUser[email]) byUser[email] = { user: row, courses: [] };
    byUser[email].courses.push(row);
  }

  for (const [email, data] of Object.entries(byUser)) {
    const courseList = data.courses.map(c =>
      `<li><strong>${c.course_title}</strong> — Vence: ${new Date(c.due_at).toLocaleDateString('es-GT')}</li>`
    ).join('');

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"eLearning AgroAmérica" <noreply@agroamerica.com>',
        to: email,
        subject: `Recordatorio: Capacitaciones por vencer — eLearning AgroAmérica`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#001B71;color:white;padding:20px;text-align:center;">
              <h2>eLearning AgroAmérica</h2>
            </div>
            <div style="padding:20px;background:#f9f9f9;">
              <p>Estimado(a) <strong>${data.user.display_name}</strong>,</p>
              <p>Las siguientes capacitaciones están próximas a vencer:</p>
              <ul>${courseList}</ul>
              <p>Por favor, complete las capacitaciones pendientes antes de la fecha de vencimiento.</p>
              <p style="text-align:center;margin-top:20px;">
                <a href="${process.env.BASE_URL || 'https://elearning.agroamerica.com'}/training"
                   style="background:#00BC70;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">
                  Ir a mis capacitaciones
                </a>
              </p>
            </div>
            <div style="padding:10px;text-align:center;font-size:12px;color:#888;">
              eLearning AgroAmérica — Plataforma de Concientización en Ciberseguridad
            </div>
          </div>`,
      });
      sent++;
    } catch (err) {
      console.error(`[NOTIFY] Error enviando a ${email}:`, err.message);
    }
  }

  return { sent, totalUsers: Object.keys(byUser).length, reminderDays, pending: rows.length };
}

/**
 * Envía notificaciones a jefes inmediatos sobre capacitaciones vencidas de su equipo.
 */
export async function notifyManagersOverdue() {
  // Obtener capacitaciones vencidas agrupadas por OU
  const { rows } = await query(
    `SELECT ou.id AS org_unit_id, ou.name AS org_unit_name,
            COUNT(te.id) AS overdue_count,
            COUNT(DISTINCT te.user_id) AS users_affected
     FROM training_enrollments te
     JOIN users u ON te.user_id = u.id
     JOIN training_campaigns tc ON te.campaign_id = tc.id
     LEFT JOIN org_units ou ON u.org_unit_id = ou.id
     WHERE te.status != 'completed'
       AND tc.due_at IS NOT NULL
       AND tc.due_at < SYSTIMESTAMP
     GROUP BY ou.id, ou.name
     HAVING COUNT(te.id) > 0`
  );

  if (rows.length === 0) return { sent: 0, message: 'No hay capacitaciones vencidas' };

  // Obtener admins (jefes) para notificar
  const { rows: admins } = await query(
    `SELECT id, email, display_name FROM users WHERE is_admin = 1 AND status = 'active'`
  );

  if (admins.length === 0) return { sent: 0, message: 'No hay administradores para notificar' };

  const transporter = getTransporter();
  let sent = 0;

  const ouList = rows.map(r =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${r.org_unit_name || 'Sin OU'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;color:#e74c3c;font-weight:bold;">${r.users_affected}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${r.overdue_count}</td>
    </tr>`
  ).join('');

  const totalOverdue = rows.reduce((sum, r) => sum + parseInt(r.overdue_count), 0);
  const totalUsers = rows.reduce((sum, r) => sum + parseInt(r.users_affected), 0);

  for (const admin of admins) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"eLearning AgroAmérica" <noreply@agroamerica.com>',
        to: admin.email,
        subject: `Alerta: ${totalUsers} usuarios con capacitaciones vencidas — eLearning AgroAmérica`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#001B71;color:white;padding:20px;text-align:center;">
              <h2>eLearning AgroAmérica</h2>
              <p style="opacity:0.8;">Reporte de Capacitaciones Vencidas</p>
            </div>
            <div style="padding:20px;background:#f9f9f9;">
              <p>Estimado(a) <strong>${admin.display_name}</strong>,</p>
              <p>El siguiente reporte muestra las unidades organizacionales con capacitaciones <strong style="color:#e74c3c;">vencidas</strong>:</p>
              <table style="width:100%;border-collapse:collapse;margin:15px 0;">
                <thead>
                  <tr style="background:#001B71;color:white;">
                    <th style="padding:8px;text-align:left;">Unidad Organizacional</th>
                    <th style="padding:8px;text-align:center;">Usuarios</th>
                    <th style="padding:8px;text-align:center;">Pendientes</th>
                  </tr>
                </thead>
                <tbody>${ouList}</tbody>
                <tfoot>
                  <tr style="font-weight:bold;background:#f0f0f0;">
                    <td style="padding:8px;">TOTAL</td>
                    <td style="padding:8px;text-align:center;color:#e74c3c;">${totalUsers}</td>
                    <td style="padding:8px;text-align:center;">${totalOverdue}</td>
                  </tr>
                </tfoot>
              </table>
              <p style="text-align:center;margin-top:20px;">
                <a href="${process.env.BASE_URL || 'https://elearning.agroamerica.com'}/admin/training"
                   style="background:#001B71;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">
                  Ver detalle en la plataforma
                </a>
              </p>
            </div>
            <div style="padding:10px;text-align:center;font-size:12px;color:#888;">
              Este es un correo automático. No responder.
            </div>
          </div>`,
      });
      sent++;
    } catch (err) {
      console.error(`[NOTIFY-MGR] Error enviando a ${admin.email}:`, err.message);
    }
  }

  return { sent, totalOverdue, totalUsers };
}

/**
 * Envía notificaciones a usuarios con capacitaciones vencidas.
 * Solo envía a usuarios activos que no hayan completado.
 */
export async function notifyOverdueUsers() {
  const { rows } = await query(
    `SELECT te.user_id, u.email, u.display_name, c.title AS course_title,
            tc.name AS campaign_name, tc.due_at
     FROM training_enrollments te
     JOIN users u ON te.user_id = u.id AND u.status = 'active'
     JOIN courses c ON te.course_id = c.id
     JOIN training_campaigns tc ON te.campaign_id = tc.id
     WHERE te.status != 'completed'
       AND tc.due_at IS NOT NULL
       AND tc.due_at < SYSTIMESTAMP`
  );

  if (rows.length === 0) return { sent: 0, message: 'No hay capacitaciones vencidas para notificar' };

  const transporter = getTransporter();
  let sent = 0;

  // Agrupar por usuario
  const byUser = {};
  for (const row of rows) {
    const email = row.email;
    if (!byUser[email]) byUser[email] = { user: row, courses: [] };
    byUser[email].courses.push(row);
  }

  for (const [email, data] of Object.entries(byUser)) {
    const courseList = data.courses.map(c =>
      `<li><strong>${c.course_title}</strong> — Venció: ${new Date(c.due_at).toLocaleDateString('es-GT')}</li>`
    ).join('');

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"eLearning AgroAmérica" <noreply@agroamerica.com>',
        to: email,
        subject: `ALERTA: Tiene capacitaciones vencidas — eLearning AgroAmérica`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#e74c3c;color:white;padding:20px;text-align:center;">
              <h2>eLearning AgroAmérica</h2>
              <p style="opacity:0.9;">Alerta de capacitación vencida</p>
            </div>
            <div style="padding:20px;background:#f9f9f9;">
              <p>Estimado(a) <strong>${data.user.display_name}</strong>,</p>
              <p>Las siguientes capacitaciones <strong style="color:#e74c3c;">ya vencieron</strong> y requieren su atención inmediata:</p>
              <ul style="color:#e74c3c;">${courseList}</ul>
              <p>Complete estas capacitaciones lo antes posible para cumplir con los requisitos de seguridad de la organización.</p>
              <p style="text-align:center;margin-top:20px;">
                <a href="${process.env.BASE_URL || 'https://elearning.agroamerica.com'}/training"
                   style="background:#e74c3c;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">
                  Completar capacitaciones pendientes
                </a>
              </p>
            </div>
            <div style="padding:10px;text-align:center;font-size:12px;color:#888;">
              Este es un correo automático — eLearning AgroAmérica
            </div>
          </div>`,
      });
      sent++;
    } catch (err) {
      console.error(`[NOTIFY-OVERDUE] Error enviando a ${email}:`, err.message);
    }
  }

  return { sent, totalUsers: Object.keys(byUser).length, totalOverdue: rows.length };
}

/**
 * Lanza una campaña de capacitación: asigna cursos de una ruta a usuarios seleccionados.
 * Lee targets desde el campo description con el marker ##TARGETS##.
 */
export async function launchTrainingCampaign(campaignId, inlineTargets = null) {
  const { rows: campaigns } = await query(
    `SELECT tc.id, tc.name, tc.org_unit_scope, tc.path_id, tc.due_at, tc.description
     FROM training_campaigns tc WHERE tc.id = :1`,
    [campaignId]
  );

  if (campaigns.length === 0) throw new Error('Campaña no encontrada');
  const campaign = campaigns[0];

  const { rows: courses } = await query(
    `SELECT course_id FROM learning_path_courses WHERE path_id = :1 ORDER BY sort_order`,
    [campaign.path_id]
  );

  if (courses.length === 0) throw new Error('La ruta no tiene cursos asignados');

  // Extract targets from description (##TARGETS##<json>)
  let storedTargets = null;
  const desc = campaign.description || '';
  const marker = '##TARGETS##';
  const markerIdx = desc.indexOf(marker);
  if (markerIdx !== -1) {
    try {
      storedTargets = JSON.parse(desc.substring(markerIdx + marker.length));
      console.log('[LAUNCH] Found stored targets in description:', JSON.stringify(storedTargets));
    } catch (e) {
      console.error('[LAUNCH] Failed to parse stored targets:', e.message);
    }
  }

  const targets = storedTargets || inlineTargets;
  console.log(`[LAUNCH] Campaign=${campaign.name} id=${campaignId}`);
  console.log(`[LAUNCH] targets=${JSON.stringify(targets)} org_unit_scope=${campaign.org_unit_scope}`);

  let users = [];

  if (targets && (targets.user_ids?.length || targets.ou_ids?.length || targets.group_ids?.length)) {
    const userMap = new Map();

    if (targets.user_ids?.length) {
      console.log(`[LAUNCH] Resolving ${targets.user_ids.length} individual user IDs`);
      for (const uid of targets.user_ids) {
        const { rows } = await query("SELECT id FROM users WHERE id = :1 AND status = 'active'", [uid]);
        if (rows.length > 0) userMap.set(rows[0].id, rows[0]);
      }
    }
    if (targets.ou_ids?.length) {
      console.log(`[LAUNCH] Resolving ${targets.ou_ids.length} OUs`);
      for (const ouId of targets.ou_ids) {
        const { rows } = await query("SELECT id FROM users WHERE org_unit_id = :1 AND status = 'active'", [ouId]);
        for (const r of rows) userMap.set(r.id, r);
      }
    }
    if (targets.group_ids?.length) {
      console.log(`[LAUNCH] Resolving ${targets.group_ids.length} custom groups`);
      for (const gid of targets.group_ids) {
        const { rows } = await query(
          `SELECT u.id FROM custom_group_members cgm JOIN users u ON cgm.user_id = u.id WHERE cgm.group_id = :1 AND u.status = 'active'`,
          [gid]
        );
        for (const r of rows) userMap.set(r.id, r);
      }
    }
    users = Array.from(userMap.values());
    console.log(`[LAUNCH] Resolved ${users.length} users from explicit targets`);
  } else if (campaign.org_unit_scope) {
    const { rows } = await query("SELECT id FROM users WHERE org_unit_id = :1 AND status = 'active'", [campaign.org_unit_scope]);
    users = rows;
    console.log(`[LAUNCH] Resolved ${users.length} users from org_unit_scope`);
  } else {
    const { rows } = await query("SELECT id FROM users WHERE status = 'active'");
    users = rows;
    console.log(`[LAUNCH] WARNING: No targets → ALL ${users.length} active users`);
  }

  if (users.length === 0) throw new Error('No hay usuarios activos en el alcance de la campaña');

  let created = 0;
  for (const user of users) {
    for (const course of courses) {
      try {
        await query(
          `MERGE INTO training_enrollments te
           USING (SELECT :1 AS user_id, :2 AS course_id, :3 AS campaign_id FROM DUAL) src
           ON (te.user_id = src.user_id AND te.course_id = src.course_id AND te.campaign_id = src.campaign_id)
           WHEN NOT MATCHED THEN
             INSERT (user_id, course_id, campaign_id, status, progress_pct)
             VALUES (src.user_id, src.course_id, src.campaign_id, 'assigned', 0)`,
          [user.id, course.course_id, campaignId]
        );
        created++;
      } catch { }
    }
  }

  return { campaign: campaign.name, users: users.length, courses: courses.length, enrollments: created };
}
