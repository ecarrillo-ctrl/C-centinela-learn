/**
 * eLearning AgroAmérica — Generación del diploma de finalización (PDF).
 * Compartido entre la descarga directa y el envío por correo, para no
 * duplicar el armado del documento.
 */
import PDFDocument from 'pdfkit';
import { query } from '../db.js';
import { getFileInfo, getFileStream } from './storage-service.js';

class DiplomaError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function fetchImageIfExists(key) {
  try {
    const info = await getFileInfo(key);
    if (!info) return null;
    const { body } = await getFileStream(key);
    const chunks = [];
    for await (const chunk of body) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

/**
 * Genera el PDF del diploma para un usuario/curso, validando elegibilidad
 * (capacitación completada y, si tenía quiz, aprobada en el primer intento).
 * @returns {Promise<{ buffer: Buffer, courseTitle: string, userName: string }>}
 */
export async function generateDiplomaPdf(userId, courseId, fallbackDisplayName = 'Usuario') {
  const { rows: enrollments } = await query(
    `SELECT completed_at FROM training_enrollments
     WHERE user_id = :1 AND course_id = :2 AND status = 'completed'
     ORDER BY completed_at DESC FETCH FIRST 1 ROWS ONLY`,
    [userId, courseId]
  );
  if (enrollments.length === 0) {
    throw new DiplomaError('Aún no ha completado esta capacitación', 403);
  }

  const { rows: attempts } = await query(
    'SELECT passed FROM user_quiz_attempts WHERE user_id = :1 AND course_id = :2 ORDER BY attempted_at ASC FETCH FIRST 1 ROWS ONLY',
    [userId, courseId]
  );
  const hadQuiz = attempts.length > 0;
  const passedFirstAttempt = !hadQuiz || attempts[0].passed === 1;
  if (!passedFirstAttempt) {
    throw new DiplomaError('El diploma solo se otorga si aprobó el quiz en su primer intento', 403);
  }

  const { rows: courseRows } = await query('SELECT title FROM courses WHERE id = :1', [courseId]);
  if (courseRows.length === 0) throw new DiplomaError('Curso no encontrado', 404);

  const { rows: userRows } = await query('SELECT display_name FROM users WHERE id = :1', [userId]);
  const userName = userRows[0]?.display_name || fallbackDisplayName;
  const courseTitle = courseRows[0].title;
  const completedAt = enrollments[0].completed_at;

  const { rows: settingRows } = await query(
    "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('diploma_signer_name', 'diploma_signer_title', 'org_name', 'diploma_logo_size')"
  );
  const settingsMap = {};
  for (const s of settingRows) settingsMap[s.setting_key] = s.setting_value;
  const signerName = settingsMap.diploma_signer_name || 'Eddy Aguilar';
  const signerTitle = settingsMap.diploma_signer_title || 'Director TI Corporativo';
  const orgName = settingsMap.org_name || 'AgroAmérica';
  const logoSize = Math.min(220, Math.max(20, parseInt(settingsMap.diploma_logo_size, 10) || 90));

  // Firma escaneada (opcional) — si no hay ninguna subida, el espacio queda en blanco.
  const signatureBuffer = await fetchImageIfExists('branding/signature.png');

  // Logo (opcional) — se sube desde Ajustes > Marca > Logotipo.
  let logoBuffer = null;
  for (const ext of ['png', 'jpg', 'jpeg']) {
    logoBuffer = await fetchImageIfExists(`branding/logo.${ext}`);
    if (logoBuffer) break;
  }

  const buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#001B71';
    const green = '#00BC70';
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    doc.rect(20, 20, pageW - 40, pageH - 40).lineWidth(3).stroke(navy);
    doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(1).stroke(green);

    if (logoBuffer) {
      try { doc.image(logoBuffer, 50, 40, { fit: [logoSize, logoSize] }); } catch { /* imagen inválida */ }
    }

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(12)
      .text('AgroAmerica', 0, 70, { align: 'center' });

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(34)
      .text('Diploma de Capacitación', 0, 110, { align: 'center' });

    doc.moveTo(pageW / 2 - 100, 160).lineTo(pageW / 2 + 100, 160).lineWidth(1.5).stroke(green);

    doc.fillColor('#555').font('Helvetica').fontSize(13)
      .text('Se otorga el presente diploma a', 0, 190, { align: 'center' });

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(28)
      .text(userName, 0, 220, { align: 'center' });

    doc.fillColor('#555').font('Helvetica').fontSize(13)
      .text('por haber completado satisfactoriamente la capacitación', 100, 265, { align: 'center', width: pageW - 200 });

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(18)
      .text(`"${courseTitle}"`, 100, 295, { align: 'center', width: pageW - 200 });

    const dateStr = completedAt ? new Date(completedAt).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    doc.fillColor('#888').font('Helvetica').fontSize(11)
      .text(`Fecha de finalización: ${dateStr}`, 0, 335, { align: 'center' });

    const sigY = pageH - 130;
    const sigCenterX = pageW / 2;
    if (signatureBuffer) {
      try { doc.image(signatureBuffer, sigCenterX - 60, sigY - 45, { width: 120, height: 45 }); } catch { /* imagen inválida */ }
    }
    doc.moveTo(sigCenterX - 100, sigY).lineTo(sigCenterX + 100, sigY).lineWidth(1).stroke('#999');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(navy)
      .text(`${signerName}, ${signerTitle}`, sigCenterX - 150, sigY + 10, { width: 300, align: 'center' });

    doc.font('Helvetica').fontSize(8).fillColor('#aaa')
      .text(`Generado por eLearning ${orgName} — Plataforma de Concientización en Ciberseguridad`, 0, pageH - 45, { align: 'center' });

    doc.end();
  });

  return { buffer, courseTitle, userName };
}

export { DiplomaError };
