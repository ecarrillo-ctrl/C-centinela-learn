/**
 * eLearning AgroAmérica — Middleware de Upload
 * Usa multer con almacenamiento en memoria para subir a S3.
 */

import multer from 'multer';
import path from 'node:path';

const storage = multer.memoryStorage();

/**
 * Filtro de tipos de archivo — acepta todos los formatos educativos.
 */
function fileFilter(req, file, cb) {
  const allowedExts = [
    // Video
    '.mp4', '.webm', '.mov', '.avi', '.mkv',
    // PDF y documentos
    '.pdf', '.doc', '.docx', '.txt', '.rtf',
    // Presentaciones
    '.pptx', '.ppt', '.odp',
    // Hojas de cálculo
    '.xlsx', '.xls', '.csv',
    // Imágenes
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico',
    // Audio
    '.mp3', '.wav', '.ogg', '.m4a',
    // SCORM / paquetes
    '.zip', '.rar', '.7z',
    // Otros
    '.html', '.htm',
  ];

  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExts.includes(ext) || file.mimetype.startsWith('image/') ||
    file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') ||
    file.mimetype === 'application/pdf' || file.mimetype === 'application/zip' ||
    file.mimetype === 'application/octet-stream' ||
    file.mimetype.includes('officedocument') || file.mimetype.includes('msword') ||
    file.mimetype.includes('presentation') || file.mimetype.includes('spreadsheet')) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype} (${ext}). Contacte al administrador si necesita subir este tipo.`), false);
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

export const uploadSmall = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});
