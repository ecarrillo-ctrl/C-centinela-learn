# Solicitud de Creación de Bucket S3 — eLearning AgroAmérica

**Fecha:** 2026-07-20  
**Solicitante:** [Tu nombre]  
**Proyecto:** eLearning AgroAmérica — Plataforma de Concientización en Ciberseguridad  
**Prioridad:** Alta  

---

## 1. Resumen

Se solicita la creación de un bucket S3 para almacenar los archivos de contenido de capacitación (videos, PDFs, paquetes SCORM, presentaciones) del proyecto **eLearning AgroAmérica**.

El backend de la aplicación (Node.js en EC2) sube y lee archivos de este bucket. Los usuarios finales acceden al contenido mediante **presigned URLs** temporales generadas por el backend — no acceden directamente al bucket.

---

## 2. Especificaciones del Bucket

| Parámetro | Valor |
|---|---|
| **Nombre del bucket** | `elearning-agroamerica-storage` |
| **Región** | `us-east-1` (o la misma región de la EC2/RDS) |
| **Acceso público** | **BLOQUEADO** (Block All Public Access = ON) |
| **Versionamiento** | Habilitado (protege contra borrados accidentales) |
| **Encriptación** | SSE-S3 (AES-256) por defecto |
| **Object Lock** | No requerido |

---

## 3. Estructura de carpetas (prefixes)

```
elearning-agroamerica-storage/
├── content/
│   ├── videos/          ← Videos .mp4, .webm (hasta 500 MB c/u)
│   ├── pdfs/            ← Documentos PDF de capacitación
│   ├── scorm/           ← Paquetes SCORM descomprimidos (1 carpeta por curso)
│   │   ├── <course-uuid>/
│   │   │   ├── imsmanifest.xml
│   │   │   ├── index.html
│   │   │   └── ...
│   ├── presentations/   ← Archivos .pptx
│   └── other/           ← Otros archivos
└── backups/             ← Backups de base de datos (pg_dump)
```

---

## 4. Estimación de almacenamiento

| Tipo de contenido | Tamaño promedio | Cantidad estimada (año 1) | Total estimado |
|---|---|---|---|
| Videos | 50-200 MB | 50-100 | 5-20 GB |
| PDFs | 1-10 MB | 100-200 | 0.5-2 GB |
| Paquetes SCORM | 10-100 MB | 20-50 | 0.5-5 GB |
| Presentaciones | 5-30 MB | 30-50 | 0.3-1.5 GB |
| Backups | 50-200 MB | 365 (diarios) | 20-70 GB |
| **Total año 1** | | | **~30-100 GB** |

---

## 5. Lifecycle Rules (reglas de ciclo de vida)

| Regla | Prefix | Acción |
|---|---|---|
| Backups a Glacier | `backups/` | Mover a Glacier después de 30 días |
| Eliminar backups antiguos | `backups/` | Eliminar después de 365 días |
| Limpiar versiones anteriores | (todo el bucket) | Eliminar versiones no-current después de 90 días |

---

## 6. IAM Policy para la EC2

La EC2 donde corre el backend necesita un **IAM Role** con la siguiente política para acceder al bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ElearningS3Access",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::elearning-agroamerica-storage",
        "arn:aws:s3:::elearning-agroamerica-storage/*"
      ]
    }
  ]
}
```

**Nombre sugerido para la política:** `ElearningAgroamericaS3Policy`  
**Nombre sugerido para el rol:** `ElearningAgroamericaEC2Role`

> **Importante:** Este rol ya debería tener la política `AmazonSSMManagedInstanceCore` (para Session Manager). Solo agregar la política S3.

---

## 7. CORS Configuration

El bucket necesita CORS habilitado para que el frontend pueda reproducir videos y PDFs directamente desde las presigned URLs:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://learn.agroamerica.com",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "Content-Range",
      "Accept-Ranges"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 8. Bucket Policy (opcional, para acceso SOLO via presigned URLs)

No se necesita bucket policy adicional. El acceso es únicamente a través de:
1. El IAM Role de la EC2 (backend sube/lee archivos)
2. Presigned URLs generadas por el backend (usuarios consumen contenido)

---

## 9. Creación via AWS CLI

Si prefiere crear el bucket por CLI:

```bash
# Crear bucket
aws s3api create-bucket \
  --bucket elearning-agroamerica-storage \
  --region us-east-1

# Bloquear acceso público
aws s3api put-public-access-block \
  --bucket elearning-agroamerica-storage \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Habilitar versionamiento
aws s3api put-bucket-versioning \
  --bucket elearning-agroamerica-storage \
  --versioning-configuration Status=Enabled

# Encriptación por defecto (SSE-S3)
aws s3api put-bucket-encryption \
  --bucket elearning-agroamerica-storage \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

# CORS
aws s3api put-bucket-cors \
  --bucket elearning-agroamerica-storage \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedOrigins": ["https://learn.agroamerica.com", "http://localhost:5173", "http://localhost:3000"],
      "ExposeHeaders": ["Content-Length", "Content-Type", "Content-Range", "Accept-Ranges"],
      "MaxAgeSeconds": 3600
    }]
  }'

# Lifecycle rule para backups
aws s3api put-bucket-lifecycle-configuration \
  --bucket elearning-agroamerica-storage \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "BackupsToGlacier",
        "Status": "Enabled",
        "Filter": {"Prefix": "backups/"},
        "Transitions": [{"Days": 30, "StorageClass": "GLACIER"}],
        "Expiration": {"Days": 365}
      },
      {
        "ID": "CleanOldVersions",
        "Status": "Enabled",
        "Filter": {},
        "NoncurrentVersionExpiration": {"NoncurrentDays": 90}
      }
    ]
  }'
```

---

## 10. Verificación post-creación

```bash
# Verificar que el bucket existe
aws s3 ls s3://elearning-agroamerica-storage/

# Verificar acceso desde la EC2 (con IAM Role)
aws s3 cp test.txt s3://elearning-agroamerica-storage/test.txt
aws s3 rm s3://elearning-agroamerica-storage/test.txt

# Verificar CORS
curl -I -H "Origin: https://learn.agroamerica.com" \
  "https://elearning-agroamerica-storage.s3.amazonaws.com/"
```

---

## 11. Datos que necesito de vuelta

Una vez creado el bucket, confirmar:

1. **Nombre exacto del bucket** (debería ser `elearning-agroamerica-storage`)
2. **Región** donde se creó
3. **IAM Role ARN** asignado a la EC2
4. **Confirmación** de que CORS está configurado

No se necesitan access keys — el backend usa el IAM Role de la EC2 automáticamente.

---

## 12. Costo estimado

| Concepto | Estimación mensual |
|---|---|
| S3 Standard (50 GB) | ~$1.15 |
| S3 Glacier (backups, 30 GB) | ~$0.12 |
| PUT requests (500/mes) | ~$0.003 |
| GET requests (10,000/mes) | ~$0.004 |
| Data transfer (50 GB/mes saliente) | ~$4.50 |
| **Total estimado** | **~$6/mes** |

> S3 es extremadamente económico. El mayor costo será el data transfer saliente (videos), pero Cloudflare cachea automáticamente el contenido estático.

---

## 13. Contacto

Para cualquier duda sobre esta solicitud:

- **Equipo:** [Tu equipo]
- **Email:** [Tu email]
- **Slack/Teams:** [Tu canal]

---

*Documento generado el 2026-07-20 para el proyecto eLearning AgroAmérica.*
