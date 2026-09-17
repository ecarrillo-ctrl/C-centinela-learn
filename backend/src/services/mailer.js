/**
 * eLearning AgroAmérica — Utilidad de envío de correo compartida.
 * Usada por las notificaciones de capacitación (asignación, recordatorios) y
 * el envío de diplomas por correo. El módulo de phishing simulado mantiene su
 * propio transporter con configuración de volumen distinta (rate limit alto
 * para campañas masivas) y no se toca aquí.
 */
import nodemailer from 'nodemailer';

let _transporter = null;

export function getTransporter() {
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

export async function sendEmail(to, subject, html, attachments = []) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"eLearning AgroAmérica" <noreply@agroamerica.com>',
    to,
    subject,
    html,
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}
