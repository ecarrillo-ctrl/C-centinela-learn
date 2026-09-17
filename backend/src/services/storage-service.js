/**
 * eLearning AgroAmérica — Servicio de Almacenamiento S3
 *
 * Abstrae todas las operaciones de archivos (videos, PDFs, SCORM, presentaciones)
 * contra Amazon S3. Provee:
 * - Upload de archivos (Buffer o Stream)
 * - Generación de presigned URLs para descarga/streaming
 * - Listado de archivos en un prefix
 * - Eliminación de archivos
 * - Copia entre keys
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configuración — en producción se usa IAM Role de la EC2 (sin keys explícitas)
const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
};

// Solo agregar credentials explícitas si están definidas (dev local con keys)
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

// Para desarrollo local con MinIO o localstack
if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
  s3Config.forcePathStyle = true;
}

const s3 = new S3Client(s3Config);
const BUCKET = process.env.S3_BUCKET || 'elearning-agroamerica-storage';

// Prefijos para organizar archivos en el bucket
const PREFIXES = {
  videos: 'content/videos/',
  pdfs: 'content/pdfs/',
  scorm: 'content/scorm/',
  presentations: 'content/presentations/',
  backups: 'backups/',
  other: 'content/other/',
};

/**
 * Determina el prefix de S3 basado en la extensión del archivo.
 */
export function getPrefix(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return PREFIXES.videos;
  if (['pdf'].includes(ext)) return PREFIXES.pdfs;
  if (['zip'].includes(ext)) return PREFIXES.scorm;
  if (['pptx', 'ppt'].includes(ext)) return PREFIXES.presentations;
  return PREFIXES.other;
}

/**
 * Sube un archivo a S3.
 * @param {string} key - La key completa en S3 (ej: content/videos/uuid.mp4)
 * @param {Buffer|ReadableStream} body - El contenido del archivo
 * @param {string} contentType - MIME type
 * @param {object} metadata - Metadata adicional (opcional)
 * @returns {Promise<{key: string, bucket: string, url: string}>}
 */
export async function uploadFile(key, body, contentType, metadata = {}) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: {
      'uploaded-by': 'elearning-agroamerica',
      ...metadata,
    },
  });

  await s3.send(command);

  return {
    key,
    bucket: BUCKET,
    url: `s3://${BUCKET}/${key}`,
  };
}

/**
 * Genera una presigned URL para acceso temporal al archivo.
 * @param {string} key - La key del archivo en S3
 * @param {number} expiresIn - Tiempo de expiración en segundos (default 1h)
 * @param {object} options - Opciones adicionales (ResponseContentType, ResponseContentDisposition)
 * @returns {Promise<string>} URL firmada
 */
export async function getPresignedUrl(key, expiresIn = 3600, options = {}) {
  const commandParams = {
    Bucket: BUCKET,
    Key: key,
  };

  if (options.contentType) {
    commandParams.ResponseContentType = options.contentType;
  }
  if (options.disposition) {
    commandParams.ResponseContentDisposition = options.disposition;
  }

  const command = new GetObjectCommand(commandParams);
  return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Genera una presigned URL para streaming de video con soporte de Range requests.
 * @param {string} key - La key del video en S3
 * @param {number} expiresIn - Expiración en segundos (default 4h para videos largos)
 * @returns {Promise<string>}
 */
export async function getVideoStreamUrl(key, expiresIn = 14400) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Obtiene el stream del archivo directamente desde S3.
 * Útil para proxy de archivos pequeños o cuando no se quiere exponer la presigned URL.
 * @param {string} key
 * @returns {Promise<{body: ReadableStream, contentType: string, contentLength: number}>}
 */
export async function getFileStream(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  const response = await s3.send(command);
  return {
    body: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
}

/**
 * Obtiene metadata de un archivo (sin descargarlo).
 * @param {string} key
 * @returns {Promise<{contentType: string, contentLength: number, lastModified: Date, metadata: object}|null>}
 */
export async function getFileInfo(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    const response = await s3.send(command);
    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      metadata: response.Metadata || {},
    };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Lista archivos bajo un prefix en S3.
 * @param {string} prefix - El prefix a listar (ej: content/scorm/uuid/)
 * @param {number} maxKeys - Máximo de resultados
 * @returns {Promise<Array<{key: string, size: number, lastModified: Date}>>}
 */
export async function listFiles(prefix, maxKeys = 1000) {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await s3.send(command);
  return (response.Contents || []).map(item => ({
    key: item.Key,
    size: item.Size,
    lastModified: item.LastModified,
  }));
}

/**
 * Elimina un archivo de S3.
 * @param {string} key
 */
export async function deleteFile(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await s3.send(command);
}

/**
 * Elimina múltiples archivos bajo un prefix (ej: todo un directorio SCORM).
 * @param {string} prefix
 */
export async function deletePrefix(prefix) {
  const files = await listFiles(prefix);
  for (const file of files) {
    await deleteFile(file.key);
  }
}

/**
 * Copia un archivo dentro del mismo bucket.
 * @param {string} sourceKey
 * @param {string} destinationKey
 */
export async function copyFile(sourceKey, destinationKey) {
  const command = new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: `${BUCKET}/${sourceKey}`,
    Key: destinationKey,
  });
  await s3.send(command);
}

/**
 * Sube un paquete SCORM descomprimido a S3 bajo un prefix.
 * @param {string} localDir - Directorio local temporal con el SCORM descomprimido
 * @param {string} courseId - UUID del curso
 * @returns {Promise<{prefix: string, fileCount: number}>}
 */
export async function uploadScormPackage(localDir, courseId) {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const prefix = `${PREFIXES.scorm}${courseId}/`;
  let fileCount = 0;

  async function uploadDir(dirPath, s3Prefix) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await uploadDir(fullPath, `${s3Prefix}${entry.name}/`);
      } else {
        const body = fs.readFileSync(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        const mimeMap = {
          '.html': 'text/html', '.htm': 'text/html',
          '.js': 'application/javascript', '.css': 'text/css',
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.png': 'image/png', '.gif': 'image/gif',
          '.svg': 'image/svg+xml', '.xml': 'application/xml',
          '.json': 'application/json', '.swf': 'application/x-shockwave-flash',
          '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
          '.woff': 'font/woff', '.woff2': 'font/woff2',
          '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';

        await uploadFile(`${s3Prefix}${entry.name}`, body, contentType);
        fileCount++;
      }
    }
  }

  await uploadDir(localDir, prefix);

  return { prefix, fileCount };
}

/**
 * Genera presigned URLs para todos los archivos de un paquete SCORM.
 * Útil para el launcher que necesita servir múltiples archivos estáticos.
 * @param {string} courseId
 * @param {string} filePath - Path relativo dentro del paquete SCORM
 * @param {number} expiresIn - Expiración (default 2h)
 * @returns {Promise<string>}
 */
export async function getScormFileUrl(courseId, filePath, expiresIn = 7200) {
  const key = `${PREFIXES.scorm}${courseId}/${filePath}`;
  return getPresignedUrl(key, expiresIn, { contentType: guessContentType(filePath) });
}

/**
 * Adivina el content-type basado en la extensión.
 */
function guessContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const map = {
    html: 'text/html', htm: 'text/html',
    js: 'application/javascript', css: 'text/css',
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', gif: 'image/gif',
    svg: 'image/svg+xml', xml: 'application/xml',
    json: 'application/json', pdf: 'application/pdf',
    mp4: 'video/mp4', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav',
  };
  return map[ext] || 'application/octet-stream';
}

export { BUCKET, PREFIXES, s3 };
