/**
 * eLearning AgroAmérica — Utilidad de envío de correo compartida.
 * Usada por las notificaciones de capacitación (asignación, recordatorios) y
 * el envío de diplomas por correo. El módulo de phishing simulado mantiene su
 * propio transporter (rate limit alto para campañas masivas) pero reutiliza
 * getSmtpConfig() de aquí para no duplicar la lectura de configuración.
 *
 * Host/puerto/remitente se pueden configurar desde Ajustes > Integraciones
 * (tabla app_settings: smtp_host, smtp_port, smtp_from) — si no están
 * definidos ahí, se usan las variables de entorno como respaldo. Las
 * credenciales (usuario/contraseña) SIEMPRE vienen de variables de entorno
 * (SMTP_USER/SMTP_PASSWORD), nunca de la base de datos, por seguridad.
 */
import nodemailer from 'nodemailer';
import { query } from '../db.js';

let _transporter = null;
let _cacheKey = null;

/**
 * Lee host/puerto/remitente desde app_settings, con las variables de entorno
 * como respaldo si no hay nada configurado en la base de datos.
 */
export async function getSmtpConfig() {
  let dbSettings = {};
  try {
    const { rows } = await query(
      "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('smtp_host', 'smtp_port', 'smtp_from')"
    );
    for (const r of rows) {
      if (r.setting_value) dbSettings[r.setting_key] = r.setting_value;
    }
  } catch { /* si la consulta falla, se usan solo las variables de entorno */ }

  return {
    host: dbSettings.smtp_host || process.env.SMTP_HOST || 'mailhog',
    port: parseInt(dbSettings.smtp_port || process.env.SMTP_PORT || '587', 10),
    from: dbSettings.smtp_from || process.env.SMTP_FROM || '"eLearning AgroAmérica" <noreply@agroamerica.com>',
  };
}

export async function getTransporter() {
  const cfg = await getSmtpConfig();
  const cacheKey = `${cfg.host}:${cfg.port}`;

  // Reconstruye el transporter solo si cambió el host/puerto desde la última
  // vez (ej. un admin lo actualizó en Ajustes > Integraciones), para no
  // perder el pool de conexiones en el caso normal de que no haya cambiado.
  if (_transporter && _cacheKey === cacheKey) return _transporter;

  _transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: process.env.SMTP_SECURE === 'true',
    ...(process.env.SMTP_USER ? {
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    } : {}),
    pool: true,
    maxConnections: 3,
  });
  _cacheKey = cacheKey;
  return _transporter;
}

export async function sendEmail(to, subject, html, attachments = []) {
  const cfg = await getSmtpConfig();
  const transporter = await getTransporter();
  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    html,
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}
