import { Router, raw as expressRaw } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { scormProgressSchema } from '../schemas/content.js';
import { upload } from '../middleware/upload.js';
import { parseSCORM, unwrapSCORMZip } from '../services/scorm-parser.js';
import { query } from '../db.js';
import {
  uploadFile, deleteFile, getPresignedUrl, getVideoStreamUrl, getFileStream,
  getFileInfo, deletePrefix, uploadScormPackage, getScormFileUrl,
  getPrefix, PREFIXES,
} from '../services/storage-service.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';

// ============================================================================
// Helpers
// ============================================================================

function renderContentAsHTML(title, markdown) {
  // Convert markdown-like content to styled HTML for iframe display
  let html = markdown;

  // Convert ## headers
  html = html.replace(/^## (\d+)\. (.+)$/gm, '<h2 class="section-title"><span class="num">$1</span>$2</h2>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="section-title">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Convert images ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="section-img" />');

  // Convert **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Convert bullet points
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Convert line breaks to paragraphs
  html = html.split('\n\n').map(p => {
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<img')) return p;
    if (p.trim()) return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    return '';
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.7; padding: 40px 20px; }
  .container { max-width: 800px; margin: 0 auto; }
  h1 { color: #001B71; font-size: 2em; margin-bottom: 8px; font-family: Georgia, serif; }
  h2.section-title { color: #001B71; font-size: 1.3em; margin: 40px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 12px; }
  h2 .num { background: #001B71; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8em; flex-shrink: 0; }
  p { margin: 12px 0; color: #334155; }
  strong { color: #001B71; }
  ul { margin: 12px 0; padding-left: 24px; }
  li { margin: 6px 0; color: #334155; }
  .section-img { width: 100%; max-height: 300px; object-fit: cover; border-radius: 12px; margin: 16px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
  hr { border: none; border-top: 2px solid #e2e8f0; margin: 32px 0; }
  .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 0.85em; }
</style>
</head>
<body>
<div class="container">
${html}
<div class="footer">eLearning AgroAmérica — Material de capacitación corporativa</div>
</div>
</body>
</html>`;
}

async function checkEnrollment(userId, courseId) {
  const { rows } = await query(
    `SELECT id, status FROM training_enrollments
     WHERE user_id = :1 AND course_id = :2 AND status != 'completed'
     FETCH FIRST 1 ROWS ONLY`,
    [userId, courseId]
  );

  if (rows.length === 0) {
    // MERGE equivalent of ON CONFLICT — Oracle syntax
    await query(
      `MERGE INTO training_enrollments te
       USING (SELECT :1 AS user_id, :2 AS course_id FROM DUAL) src
       ON (te.user_id = src.user_id AND te.course_id = src.course_id AND te.campaign_id IS NULL)
       WHEN MATCHED THEN
         UPDATE SET status = CASE WHEN te.status = 'assigned' THEN 'in_progress' ELSE te.status END
       WHEN NOT MATCHED THEN
         INSERT (user_id, course_id, status) VALUES (src.user_id, src.course_id, 'in_progress')`,
      [userId, courseId]
    );
  }
  return true;
}

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
    '.pdf': 'application/pdf',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
  };
  return map[ext] || 'application/octet-stream';
}

// ============================================================================
// UPLOAD — Subir contenido (video, PDF, presentación) a S3
// ============================================================================

async function createCourseFromFile(file, body, user) {
  {
    const req = { user, body };
    const ext = path.extname(file.originalname).toLowerCase();
    const title = body.title || path.basename(file.originalname, ext);
    const level = body.level || 'basico';
    const description = body.description || '';

    let type = 'pdf';
    if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) type = 'video_upload';
    else if (['.pptx', '.ppt', '.odp'].includes(ext)) type = 'presentation';
    else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'].includes(ext)) type = 'image';
    else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) type = 'audio';
    else if (['.doc', '.docx', '.txt', '.rtf', '.html', '.htm'].includes(ext)) type = 'document';

    // Generar key de S3: content/videos/uuid.mp4
    const fileId = uuidv4();
    const s3Key = `${getPrefix(file.originalname)}${fileId}${ext}`;
    const contentType = guessContentType(file.originalname);

    // Subir a S3 desde el buffer en memoria
    await uploadFile(s3Key, file.buffer, contentType, {
      'original-name': file.originalname,
      'uploaded-by': req.user.id,
    });

    // Guardar en BD con la key de S3 como storage_key
    await query(
      `INSERT INTO courses (title, description, level_type, course_type, storage_key, created_by)
       VALUES (:1, :2, :3, :4, :5, :6)`,
      [title, description, level, type, s3Key, req.user.id]
    );

    const { rows } = await query(
      `SELECT id FROM courses WHERE storage_key = :1 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [s3Key]
    );

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json)
       VALUES (:1, 'content_upload', 'course', :2, :3)`,
      [req.user.id, rows[0]?.ID || rows[0]?.id, JSON.stringify({ filename: file.originalname, type, level, s3Key })]
    );

    return { success: true, course: { id: rows[0]?.ID || rows[0]?.id, title, type, level } };
  }
}

router.post('/admin/content/upload', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    res.json(await createCourseFromFile(req.file, req.body, req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SUBIDA POR PARTES — Cloudflare limita cada petición a 100 MB, así que los archivos
// grandes se envían en partes de pocos MB y se ensamblan aquí antes de subirlos a S3.
// ============================================================================

const CHUNK_ROOT = path.join(os.tmpdir(), 'upload-chunks');
const safeUploadId = id => /^[a-zA-Z0-9-]{8,64}$/.test(id || '');

router.post('/admin/content/chunk', authenticateToken, requireAdmin,
  expressRaw({ type: 'application/octet-stream', limit: '30mb' }), async (req, res) => {
    try {
      const { uploadId, index } = req.query;
      if (!safeUploadId(uploadId) || !/^\d{1,5}$/.test(index || '') || !Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ error: 'Parte inválida' });
      }
      const dir = path.join(CHUNK_ROOT, uploadId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${index}.part`), req.body);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

router.post('/admin/content/chunk/complete', authenticateToken, requireAdmin, async (req, res) => {
  const { uploadId, total, filename, mode, replaceId } = req.body;
  const dir = path.join(CHUNK_ROOT, String(uploadId));
  try {
    if (!safeUploadId(uploadId) || !filename || !Number.isInteger(total) || total < 1) {
      return res.status(400).json({ error: 'Datos de subida inválidos' });
    }
    const parts = [];
    for (let i = 0; i < total; i++) {
      const p = path.join(dir, `${i}.part`);
      if (!fs.existsSync(p)) return res.status(400).json({ error: `Falta la parte ${i + 1} de ${total}` });
      parts.push(fs.readFileSync(p));
    }
    const file = { originalname: path.basename(String(filename)), buffer: Buffer.concat(parts) };
    if (file.buffer.length > 2 * 1024 * 1024 * 1024) return res.status(400).json({ error: 'Archivo demasiado grande' });

    if (mode === 'replace') {
      if (!replaceId) return res.status(400).json({ error: 'replaceId requerido' });
      res.json(await replaceCourseFile(file, replaceId));
    } else {
      res.json(await createCourseFromFile(file, req.body, req.user));
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (safeUploadId(uploadId)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================================
// UPLOAD SCORM — Descomprimir zip, parsear manifest, subir a S3
// ============================================================================

router.post('/admin/content/scorm', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Archivo SCORM .zip requerido' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.zip') {
      return res.status(400).json({ error: 'Solo se aceptan archivos .zip para SCORM' });
    }

    const courseId = uuidv4();

    // Escribir el zip a un directorio temporal para descomprimirlo
    const tmpDir = path.join(os.tmpdir(), `scorm-${courseId}`);
    const zipPath = path.join(tmpDir, 'package.zip');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(zipPath, req.file.buffer);

    // Descomprimir y parsear el manifest
    const scormDir = path.join(tmpDir, 'content');
    unwrapSCORMZip(zipPath, scormDir);
    const manifest = parseSCORM(scormDir);

    // Subir todo el directorio descomprimido a S3
    const { prefix, fileCount } = await uploadScormPackage(scormDir, courseId);

    // Limpiar archivos temporales
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // La storage_key para SCORM es el prefix de S3 (sin trailing slash)
    const s3Key = `${PREFIXES.scorm}${courseId}`;

    const { rows } = await query(
      `INSERT INTO courses (id, title, description, level_type, course_type, storage_key, created_by)
       VALUES (:1, :2, :3, :4, 'scorm', :5, :6)`,
      [courseId, manifest.title, req.body.description || '', req.body.level || 'basico', s3Key, req.user.id]
    );

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json)
       VALUES (:1, 'content_scorm_upload', 'course', :2, :3)`,
      [req.user.id, courseId, JSON.stringify({ title: manifest.title, scormVersion: manifest.scormVersion, fileCount })]
    );

    res.json({
      success: true,
      course: {
        id: courseId,
        title: manifest.title,
        type: 'scorm',
        level: req.body.level || 'basico',
        scorm_version: manifest.scormVersion,
        launch_file: manifest.launchFile,
        file_count: fileCount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// STREAM VIDEO — Devuelve presigned URL para streaming directo desde S3
// ============================================================================

router.get('/content/stream/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const { rows: courses } = await query(
      'SELECT id, storage_key, external_id, source_url, course_type FROM courses WHERE id = $1 AND deleted_at IS NULL AND is_active = 1',
      [courseId]
    );
    if (courses.length === 0) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const course = courses[0];
    if (!['video_upload', 'video_embed'].includes(course.course_type)) {
      return res.status(400).json({ error: 'Este curso no es un video' });
    }

    if (!req.user.isAdmin) {
      await checkEnrollment(req.user.id, courseId);
    }

    // Videos embebidos (YouTube/Vimeo) — no usan S3
    if (course.course_type === 'video_embed') {
      return res.json({
        type: 'video_embed',
        external_id: course.external_id || course.storage_key || null,
        source_url: course.source_url || null,
      });
    }

    // Videos propios — redirigir a presigned URL de S3
    const streamUrl = await getVideoStreamUrl(course.storage_key);
    res.redirect(302, streamUrl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PDF — Devuelve presigned URL para visualizar el PDF
// ============================================================================

router.get('/content/pdf/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const { rows: courses } = await query(
      'SELECT id, storage_key, title, description, course_type FROM courses WHERE id = $1 AND deleted_at IS NULL AND is_active = 1',
      [courseId]
    );
    if (courses.length === 0) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const course = courses[0];

    // If no storage_key (AI-generated content), render description as HTML
    if (!course.storage_key) {
      const desc = course.description || 'Sin contenido';
      const html = renderContentAsHTML(course.title, desc);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      return res.send(html);
    }

    // Verificar que el archivo existe en S3
    const info = await getFileInfo(course.storage_key);
    if (!info) {
      return res.status(404).json({ error: 'Archivo no encontrado en storage' });
    }

    if (!req.user.isAdmin) {
      await checkEnrollment(req.user.id, courseId);
    }

    // Presigned URL para visualizar inline (1h)
    const ext = (course.storage_key || '').split('.').pop().toLowerCase();
    const mimeMap = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav' };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const url = await getPresignedUrl(course.storage_key, 3600, {
      contentType,
      disposition: `inline; filename="${course.title}.${ext}"`,
    });

    // Redirigir directamente para que el navegador lo muestre
    res.redirect(302, url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SCORM LAUNCH — Genera HTML con SCORM API y presigned URLs para archivos
// ============================================================================

router.get('/content/scorm/:courseId/launch', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const { rows: courses } = await query(
      'SELECT id, storage_key, title FROM courses WHERE id = $1 AND course_type = $2 AND deleted_at IS NULL AND is_active = 1',
      [courseId, 'scorm']
    );
    if (courses.length === 0) {
      return res.status(404).json({ error: 'Curso SCORM no encontrado' });
    }

    if (!req.user.isAdmin) {
      await checkEnrollment(req.user.id, courseId);
    }

    // Obtener manifest desde S3 (descargar imsmanifest.xml temporalmente)
    const manifestKey = `${courses[0].storage_key}/imsmanifest.xml`;
    const manifestInfo = await getFileInfo(manifestKey);
    if (!manifestInfo) {
      return res.status(404).json({ error: 'Manifest SCORM no encontrado en storage' });
    }

    const manifestStream = await getFileStream(manifestKey);
    const chunks = [];
    for await (const chunk of manifestStream.body) {
      chunks.push(chunk);
    }
    const manifestXml = Buffer.concat(chunks).toString('utf-8');

    // Parsear manifest desde el contenido XML
    const xml2js = await import('xml2js');
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const parsed = await parser.parseStringPromise(manifestXml);
    const manifest = parsed.manifest;
    const resources = manifest?.resources?.resource;
    const resourcesArray = Array.isArray(resources) ? resources : (resources ? [resources] : []);
    const mainResource = resourcesArray.find(r => r?.type === 'webcontent' || r?.href) || resourcesArray[0];
    const launchFile = mainResource?.href || 'index.html';
    const title = courses[0].title;

    // Generar presigned URL para el archivo de lanzamiento
    const launchUrl = await getScormFileUrl(courseId, launchFile);

    // Token de corta duración para reportar progreso
    const scormToken = jwt.sign(
      { id: req.user.id, courseId, scope: 'scorm_progress' },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    const safeDisplayName = (req.user.displayName || '').replace(/[\\'"<>&]/g, '');
    const safeUserId = req.user.id;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${title.replace(/[<>&"']/g, '')}</title>
<style>
  body, html { margin:0; padding:0; height:100%; overflow:hidden; }
  iframe { width:100%; height:100%; border:none; }
</style>
<script>
var _scormToken = "${scormToken}";

function _reportProgress(status, progress) {
  fetch('/api/content/scorm/${courseId}/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _scormToken },
    body: JSON.stringify({ status: status, progress: progress })
  });
}

window.API = {
  LMSInitialize: function() { return "true"; },
  LMSFinish: function() { return "true"; },
  LMSGetValue: function(key) {
    if (key === "cmi.core.lesson_status") return "not attempted";
    if (key === "cmi.core.student_name") return "${safeDisplayName}";
    if (key === "cmi.core.student_id") return "${safeUserId}";
    return "";
  },
  LMSSetValue: function(key, value) {
    if (key === "cmi.core.lesson_status") {
      _reportProgress(value, (value === 'completed' || value === 'passed') ? 100 : 50);
    }
    return "true";
  },
  LMSCommit: function() { return "true"; },
  LMSGetLastError: function() { return "0"; },
  LMSGetErrorString: function() { return "No error"; },
  LMSGetDiagnostic: function() { return ""; }
};

window.API_1484_11 = {
  Initialize: function() { return "true"; },
  Terminate: function() { return "true"; },
  GetValue: function(key) {
    if (key === "cmi.completion_status") return "not attempted";
    if (key === "cmi.learner_name") return "${safeDisplayName}";
    if (key === "cmi.learner_id") return "${safeUserId}";
    return "";
  },
  SetValue: function(key, value) {
    if (key === "cmi.completion_status") {
      _reportProgress(value, value === 'completed' ? 100 : 50);
    }
    return "true";
  },
  Commit: function() { return "true"; },
  GetLastError: function() { return "0"; },
  GetErrorString: function() { return "No error"; },
  GetDiagnostic: function() { return ""; }
};
</script>
</head>
<body>
<iframe src="${launchUrl}" sandbox="allow-scripts allow-same-origin"></iframe>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SCORM FILE — Sirve archivos individuales del paquete SCORM via presigned URL
// ============================================================================

router.get('/content/scorm/:courseId/file', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const file = req.query.file;

    if (!file) {
      return res.status(400).json({ error: 'Parametro file requerido' });
    }

    const { rows: courses } = await query(
      'SELECT storage_key FROM courses WHERE id = $1 AND course_type = $2 AND deleted_at IS NULL AND is_active = 1',
      [courseId, 'scorm']
    );
    if (courses.length === 0) {
      return res.status(404).json({ error: 'Curso SCORM no encontrado' });
    }

    // Sanitizar el path para evitar path traversal
    const safePath = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, '').replace(/\\/g, '/');

    // Redirigir a presigned URL del archivo en S3
    const url = await getScormFileUrl(courseId, safePath);
    res.redirect(302, url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SCORM PROGRESS — Reportar progreso (recibe token de corta duración)
// ============================================================================

router.post('/content/scorm/:courseId/progress', authenticateToken, validate(scormProgressSchema), async (req, res) => {
  try {
    const { courseId } = req.params;
    const { status, progress, score, timeSpent } = req.body;

    const enrollmentStatus = (status === 'completed' || status === 'passed') ? 'completed' : 'in_progress';
    const progressPct = parseInt(progress, 10) || (enrollmentStatus === 'completed' ? 100 : 50);
    const timeSpentSec = parseInt(timeSpent, 10) || 0;

    const { rows: existing } = await query(
      `SELECT id, status, progress_pct FROM training_enrollments
       WHERE user_id = $1 AND course_id = $2 AND campaign_id IS NULL`,
      [req.user.id, courseId]
    );

    if (existing.length > 0) {
      const row = existing[0];
      const newStatus = row.status === 'completed' ? 'completed' : enrollmentStatus;
      const newProgress = Math.max(parseFloat(row.progress_pct) || 0, progressPct);
      const isCompleted = newStatus === 'completed';

      await query(
        `UPDATE training_enrollments
         SET status = :1, progress_pct = :2,
             score = COALESCE(:3, score),
             time_spent_sec = time_spent_sec + :4,
             completed_at = CASE WHEN :5 = 1 THEN SYSTIMESTAMP ELSE completed_at END
         WHERE id = :6`,
        [newStatus, newProgress, score || null, timeSpentSec, isCompleted ? 1 : 0, row.id || row.ID]
      );
    } else {
      const isCompleted = enrollmentStatus === 'completed';
      await query(
        `INSERT INTO training_enrollments (user_id, course_id, status, progress_pct, score, time_spent_sec, started_at, completed_at)
         VALUES (:1, :2, :3, :4, :5, :6, SYSTIMESTAMP, CASE WHEN :7 = 1 THEN SYSTIMESTAMP ELSE NULL END)`,
        [req.user.id, courseId, enrollmentStatus, progressPct, score || null, timeSpentSec, isCompleted ? 1 : 0]
      );
    }

    res.json({ success: true, status: enrollmentStatus, progress: progressPct });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// LIST CONTENT — Admin lista todos los cursos
// ============================================================================

router.get('/admin/content', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type, level, limit = 50, offset = 0 } = req.query;
    const conditions = ['c.deleted_at IS NULL'];
    const params = [];
    let idx = 1;

    if (type) {
      conditions.push(`c.course_type = :${idx++}`);
      params.push(type);
    }
    if (level) {
      conditions.push(`c.level_type = :${idx++}`);
      params.push(level);
    }

    const where = conditions.join(' AND ');

    const { rows } = await query(
      `SELECT c.id, c.title, c.description, c.level_type, c.course_type, c.storage_key,
              c.external_id, c.duration_min, c.is_active, c.source_license, c.created_at,
              u.display_name AS created_by_name,
              (SELECT count(*) FROM training_enrollments te WHERE te.course_id = c.id) AS enrollment_count
       FROM courses c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE ${where}
       ORDER BY c.created_at DESC
       OFFSET :${idx++} ROWS FETCH NEXT :${idx++} ROWS ONLY`,
      [...params, parseInt(offset, 10), parseInt(limit, 10)]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/content/:id/description', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { description } = req.body;
    await query('UPDATE courses SET description = :1 WHERE id = :2', [description || '', req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Edit course (title, level, description)
router.put('/admin/content/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, level, description, video_url } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;
    if (title) { sets.push(`title = :${idx++}`); params.push(title); }
    if (video_url && String(video_url).trim()) {
      const url = String(video_url).trim();
      const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
      sets.push(`external_id = :${idx++}`); params.push(yt ? yt[1] : url);
      sets.push(`source_url = :${idx++}`); params.push(url);
    }
    if (level) { sets.push(`level_type = :${idx++}`); params.push(level); }
    if (description !== undefined) { sets.push(`description = :${idx++}`); params.push(description); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    await query(`UPDATE courses SET ${sets.join(', ')} WHERE id = :${idx}`, [...params, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Replace file for existing course
async function replaceCourseFile(file, courseId) {
  {
    const ext = path.extname(file.originalname).toLowerCase();

    let type = 'pdf';
    if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) type = 'video_upload';
    else if (['.pptx', '.ppt', '.odp'].includes(ext)) type = 'presentation';
    else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'].includes(ext)) type = 'image';
    else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) type = 'audio';
    else if (['.doc', '.docx', '.txt', '.rtf', '.html', '.htm'].includes(ext)) type = 'document';

    const fileId = (await import('uuid')).v4();
    const s3Key = `${getPrefix(file.originalname)}${fileId}${ext}`;
    const contentType = guessContentType(file.originalname);

    await uploadFile(s3Key, file.buffer, contentType);

    // Al pasar a un archivo propio se limpia el enlace externo anterior
    await query(
      'UPDATE courses SET storage_key = :1, course_type = :2, external_id = NULL, source_url = NULL WHERE id = :3',
      [s3Key, type, courseId]
    );

    return { success: true, type, s3Key };
  }
}

router.post('/admin/content/replace', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.body.replaceId) return res.status(400).json({ error: 'file y replaceId requeridos' });
    res.json(await replaceCourseFile(req.file, req.body.replaceId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Quitar el video (archivo subido o enlace) de un curso sin retirar el curso
router.delete('/admin/content/:id/media', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT storage_key, course_type FROM courses WHERE id = :1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Curso no encontrado' });
    if (!['video_upload', 'video_embed'].includes(rows[0].course_type)) {
      return res.status(400).json({ error: 'Este contenido no es un video' });
    }

    if (rows[0].storage_key) {
      try { await deleteFile(rows[0].storage_key); } catch (e) { console.error('[CONTENT] No se pudo borrar de S3:', e.message); }
    }
    await query(
      "UPDATE courses SET storage_key = NULL, external_id = NULL, source_url = NULL, course_type = 'video_embed' WHERE id = :1",
      [req.params.id]
    );
    await query(
      "INSERT INTO audit_log (actor_id, action, entity_type, entity_id) VALUES (:1, 'content_media_remove', 'course', :2)",
      [req.user.id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================================
// DELETE CONTENT — Borrado lógico
// ============================================================================

router.delete('/admin/content/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { rowsAffected } = await query(
      "UPDATE courses SET deleted_at = SYSTIMESTAMP, is_active = 0 WHERE id = :1 AND deleted_at IS NULL",
      [id]
    );

    if (rowsAffected === 0) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id)
       VALUES (:1, 'content_delete', 'course', :2)`,
      [req.user.id, id]
    );

    res.json({ success: true, message: 'Curso retirado (borrado lógico).' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
