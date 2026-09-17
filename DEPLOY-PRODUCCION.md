# eLearning AgroAmérica — Guía de Despliegue en Producción

## Datos del servidor

| Parámetro | Valor |
|---|---|
| **Servidor** | 172.17.4.160 |
| **Usuario** | ubuntu |
| **Certificado** | Agroamerica-servers.pem |
| **Puerto aplicación** | 3005 |
| **URL pública** | https://elearning.agroamerica.com |
| **Autenticación** | Cloudflare Access (Cf-Access-Jwt-Assertion) |
| **Admin** | elantan@agroamerica.com |

## Arquitectura de producción

```
Internet → Cloudflare Access → elearning.agroamerica.com
                                        │
                                        ▼ (puerto 3005)
                              ┌─────────────────────┐
                              │  172.17.4.160       │
                              │                     │
                              │  nginx (frontend)   │ ← :3005 expuesto
                              │    ├── /           → SPA React (archivos estáticos)
                              │    └── /api/       → proxy a backend:3005
                              │                     │
                              │  backend (Node.js)  │ ← :3005 interno
                              │    ├── Oracle RDS   │
                              │    └── S3 bucket    │
                              └─────────────────────┘
```

---

## Paso 1 — Conectar al servidor

```bash
ssh -i Agroamerica-servers.pem ubuntu@172.17.4.160
```

## Paso 2 — Clonar el proyecto

```bash
cd /opt
sudo git clone <REPO_URL> elearning-agroamerica
sudo chown -R ubuntu:ubuntu elearning-agroamerica
cd elearning-agroamerica
```

> Si ya clonaste el proyecto, solo haz `git pull`.

## Paso 3 — Configurar el .env

El archivo `.env` ya viene configurado. Solo verifica que los passwords de LDAP y SMTP estén correctos:

```bash
nano .env
```

Variables a verificar/cambiar:
- `LDAP_BIND_PASSWORD` — Password del servicio LDAP (pedir a TI)
- `SMTP_PASSWORD` — Password del correo SMTP
- `LDAP_DRY_RUN=true` — Dejar en true hasta confirmar que todo funciona

## Paso 4 — Build y levantar

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Verificar que levantó bien:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

## Paso 5 — Verificar salud

```bash
# Desde el servidor
curl http://localhost:3005/api/health
```

Resultado esperado:
```json
{"status":"ok","service":"elearning-agroamerica-backend","version":"1.0.0","database":"connected"}
```

## Paso 6 — Configurar Cloudflare Tunnel/Access

En Cloudflare Zero Trust Dashboard:

1. **Tunnel** → Agregar ruta pública:
   - Subdomain: `elearning`
   - Domain: `agroamerica.com`
   - Service: `http://172.17.4.160:3005`

2. **Access → Applications** → Crear aplicación:
   - Name: `eLearning AgroAmérica`
   - Domain: `elearning.agroamerica.com`
   - Session Duration: 24h
   - Identity Providers: Azure AD / Google Workspace corporativo

3. **Access → Policies**:
   - Política: `Allow`
   - Include: Emails ending in `@agroamerica.com`

## Paso 7 — Verificar acceso

1. Abrir `https://elearning.agroamerica.com` en incógnito
2. Cloudflare debe pedir autenticación corporativa
3. Al autenticarse con `elantan@agroamerica.com`, debe cargar el dashboard de admin automáticamente

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker compose -f docker-compose.prod.yml logs -f backend

# Reiniciar backend
docker compose -f docker-compose.prod.yml restart backend

# Rebuild completo
docker compose -f docker-compose.prod.yml up -d --build --force-recreate

# Ver uso de recursos
docker stats elearning-backend elearning-frontend

# Entrar al contenedor del backend
docker exec -it elearning-backend sh
```

---

## Actualizar la aplicación

```bash
cd /opt/elearning-agroamerica
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Troubleshooting

### Error de conexión a Oracle
```bash
# Verificar que el puerto 5432 de la RDS es accesible
docker exec elearning-backend node -e "
const oracledb = require('oracledb');
oracledb.getConnection({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECT_STRING
}).then(c => { console.log('OK'); c.close(); }).catch(e => console.error(e.message));
"
```

### Error de S3
```bash
# Verificar acceso al bucket (requiere IAM Role en la EC2)
docker exec elearning-backend node -e "
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const s3 = new S3Client({ region: 'us-east-1' });
s3.send(new ListObjectsV2Command({ Bucket: 'elearning-agroamerica-storage', MaxKeys: 1 }))
  .then(r => console.log('OK, objects:', r.KeyCount))
  .catch(e => console.error(e.message));
"
```

### Frontend no carga
```bash
# Verificar que nginx está corriendo
docker exec elearning-frontend nginx -t

# Ver logs de nginx
docker logs elearning-frontend
```

### Cloudflare Access no funciona
- Verificar que el header `Cf-Access-Jwt-Assertion` llega al backend:
```bash
docker compose -f docker-compose.prod.yml logs backend | grep CF-AUTH
```
- Verificar que la aplicación en Cloudflare Access apunta al hostname correcto
- Verificar que la política permite `@agroamerica.com`

---

## Notas de seguridad

- El servidor NO expone puertos al internet — todo pasa por Cloudflare Tunnel
- La BD Oracle está en una VPC privada (RDS), accesible solo desde la EC2
- S3 usa IAM Role (sin keys hardcodeadas)
- La autenticación depende 100% de Cloudflare Access — no hay login con password
- El `.env` con credenciales NO se commitea al repositorio (está en `.gitignore`)
