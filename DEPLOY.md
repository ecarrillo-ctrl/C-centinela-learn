# eLearning AgroAmérica — Guia de Despliegue AWS

## Arquitectura

```
Internet → Cloudflare Tunnel → EC2 (t3.medium, Ubuntu 24.04)
                                   ├── Docker Compose
                                   │   ├── db (PostgreSQL 16)
                                   │   ├── backend (Node 24 + Express)
                                   │   ├── frontend (React + Vite)
                                   │   ├── cloudflared (tunnel)
                                   │   ├── openldap (dev/test)
                                   │   └── mailhog (dev/test)
                                   └── Storage (EBS 30-50 GB)
```

**Perímetro Zero Trust:** El Security Group de AWS NO tiene puertos abiertos al mundo. Todo el acceso es via Cloudflare Tunnel. La administracion de la EC2 se hace por AWS Systems Manager Session Manager.

## Requisitos previos

- Cuenta AWS con permisos para EC2, SSM, EBS
- Dominio en Cloudflare (ej: `agroamerica.com`)
- Cloudflare Zero Trust habilitado (Free tier es suficiente para demo)
- Docker + Docker Compose instalados en la EC2

## Paso 1 — Lanzar EC2

1. **AMI:** Ubuntu Server 24.04 LTS (HVM), SSD Volume Type
2. **Tipo:** `t3.medium` (2 vCPU, 4 GB RAM) — suficiente para 800 usuarios demo
3. **EBS:** 30-50 GB gp3
4. **Security Group — reglas inbound:**
   - **Ninguna.** No abrir puerto 22, 80, 443, ni ningún otro a `0.0.0.0/0`.
5. **IAM Role:** Asignar `AmazonSSMManagedInstanceCore` para Session Manager
6. Conectarse via AWS Console → EC2 → Connect → Session Manager

## Paso 2 — Instalar Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
newgrp docker
docker --version
docker compose version
```

## Paso 3 — Cloudflare Tunnel

1. En Cloudflare Dashboard → Zero Trust → Networks → Tunnels
2. Crear tunel: nombre `elearning-agroamerica`
3. Copiar el token de instalacion
4. Configurar subdominio publico:
   - `learn.agroamerica.com` → `http://backend:3000`
5. Cloudflare Access (para `/admin`):
   - Crear aplicacion Self-hosted
   - URL: `learn.agroamerica.com/admin*`
   - IdP: configurar con el Azure AD / Google Workspace corporativo
   - Politica: permitir solo a miembros del grupo `admin-centinela`

## Paso 4 — Desplegar la aplicacion

```bash
cd /opt
git clone <repo-url> elearning-agroamerica
cd elearning-agroamerica

# Configurar variables de entorno
cp .env.example .env
nano .env  # Editar: DB_PASSWORD, JWT_SECRET, CLOUDFLARE_TUNNEL_TOKEN, etc.

# Iniciar servicios
docker compose up -d

# Verificar que todo esta corriendo
docker compose ps
curl localhost:3000/api/health
```

## Paso 5 — Sembrar datos demo

```bash
docker compose exec backend node scripts/seed-demo.js
```

## Paso 6 — Checklist de verificacion post-deploy

- [ ] `docker compose ps`: todos `healthy` / `running`
- [ ] `curl https://learn.agroamerica.com/api/health` → `{"status":"ok"}`
- [ ] Acceder al portal usuario en `https://learn.agroamerica.com`
- [ ] Login como `admin@agroamerica.com` / `Admin123!` **(CAMBIAR EN PRODUCCION)**
- [ ] Dashboard admin muestra datos poblados
- [ ] Cloudflare Access protege `/admin` (verificar en ventana incognito sin login corporativo → bloqueado)
- [ ] Security Group de AWS no tiene reglas inbound abiertas al mundo
- [ ] Backup diario ejecutandose (verificar `./storage/backups/`)
- [ ] Prueba de phishing: enviar campana de prueba a grupo controlado, verificar tracking

## Paso 7 — Produccion

Para pasar de demo a produccion:

1. **Cambiar credenciales:** regenerar `JWT_SECRET`, `DB_PASSWORD`, `ADMIN_PASSWORD`
2. **OpenLDAP → AD real:** configurar `LDAP_URL`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD` en `.env`
3. **Mailhog → SMTP real:** configurar `SMTP_HOST`, `SMTP_PORT`, etc.
4. **SSL:** Cloudflare maneja SSL automáticamente (Full o Full Strict)
5. **Tamaño EBS:** monitorear uso de disco; migrar `storage/` a S3 si supera 30 GB
6. **Instancia:** considerar `t3.large` si se sirve video pesado a 800+ usuarios simultaneos
7. **WAF:** habilitar Cloudflare WAF con reglas para rate limiting y proteccion de bots

## Variables de entorno (`.env`)

| Variable | Descripcion | Ejemplo |
|---|---|---|
| `DB_HOST` | Hostname del contenedor DB | `db` |
| `DB_NAME` | Nombre de la base de datos | `elearning_agroamerica` |
| `DB_USER` | Usuario DB | `centinela` |
| `DB_PASSWORD` | Contraseña DB | `change_me` |
| `JWT_SECRET` | Secreto para firmar tokens JWT | `al-menos-64-caracteres` |
| `LDAP_URL` | URL del AD corporativo | `ldaps://ad.agroamerica.com:636` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token del tunel Cloudflare | `eyJh...` |
| `SMTP_HOST` | Servidor SMTP | `smtp.agroamerica.com` |
| `BASE_URL` | URL publica de la aplicacion | `https://learn.agroamerica.com` |

## Comandos utiles

```bash
# Ver logs
docker compose logs -f backend

# Reiniciar un servicio
docker compose restart backend

# Backup manual
docker compose exec backend pg_dump -h db -U centinela -d elearning_agroamerica -f ./storage/backups/manual-$(date +%Y-%m-%d).sql

# Restaurar backup
docker compose exec -T db psql -U centinela -d elearning_agroamerica < backup.sql

# Actualizar la aplicacion
git pull
docker compose up -d --build
```

## Desarrollo local

Para desarrollo local con hot-reload, MailHog y OpenLDAP:

```bash
# Copiar variables de entorno
cp .env.example .env
# (el .env ya viene configurado para desarrollo local)

# Iniciar con perfil de desarrollo
docker compose --profile dev -f docker-compose.yml -f docker-compose.dev.yml up

# Acceder a la app
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000
# MailHog (emails capturados): http://localhost:8025

# Sembrar datos demo
docker compose exec backend node scripts/seed-demo.js
```

## Configuración para RDS en producción

Para conectar el backend a una RDS en lugar del contenedor PostgreSQL local:

1. Solicitar la creación de la DB al equipo de infraestructura (ver `db/SOLICITUD-RDS.md`)
2. Ejecutar el schema: `psql -h <RDS_ENDPOINT> -U elearning_app -d elearning_agroamerica -f db/rds-schema.sql`
3. Actualizar `.env` de producción:
   ```
   DB_HOST=<RDS_ENDPOINT>
   DB_PORT=5432
   DB_NAME=elearning_agroamerica
   DB_USER=elearning_app
   DB_PASSWORD=<PASSWORD_GENERADA>
   ```
4. En producción, el servicio `db` del docker-compose no se necesita — puede comentarse o usar un compose override sin él.
