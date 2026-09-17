# Solicitud de Creación de Schema — eLearning AgroAmérica

**Fecha:** 2026-07-20  
**Solicitante:** [Tu nombre]  
**Proyecto:** eLearning AgroAmérica — Plataforma de Concientización en Ciberseguridad  
**Prioridad:** Alta  
**Motor de BD:** Oracle Database 19c Standard Edition 2 Release 19.0.0.0.0 - Production  

---

## 1. Resumen

Se solicita la creación de un **schema (usuario)** dentro de la instancia Oracle 19c existente para el proyecto **eLearning AgroAmérica**. Este schema contendrá las tablas, índices, triggers, vistas materializadas, packages y funciones necesarios para la plataforma.

---

## 2. Requerimientos

### 2.1 Schema (usuario de aplicación)

| Parámetro | Valor |
|---|---|
| **Nombre del schema** | `ELEARNING` |
| **Default Tablespace** | `USERS` (o el tablespace de datos que corresponda) |
| **Temporary Tablespace** | `TEMP` |
| **Quota** | `UNLIMITED ON USERS` (o mínimo 5 GB) |
| **Profile** | `DEFAULT` o un profile con `FAILED_LOGIN_ATTEMPTS=10` |

### 2.2 Privilegios del sistema requeridos

| Privilegio | Motivo |
|---|---|
| `CREATE SESSION` | Conexión a la BD |
| `CREATE TABLE` | Crear las 16 tablas |
| `CREATE VIEW` | Crear vistas |
| `CREATE MATERIALIZED VIEW` | 4 vistas materializadas para analytics |
| `CREATE PROCEDURE` | Packages PL/SQL y funciones |
| `CREATE TRIGGER` | 24 triggers (BEFORE INSERT/UPDATE) |
| `CREATE SEQUENCE` | Reservado para uso futuro |
| `CREATE JOB` | Job de DBMS_SCHEDULER para refresh horario |
| `QUERY REWRITE` | Habilitar query rewrite en vistas materializadas |
| `ON COMMIT REFRESH` | Refresh de materialized views (opcional) |

### 2.3 Privilegios de objetos (si aplica)

No se requieren privilegios sobre schemas de otros usuarios. Todo vive dentro del schema `ELEARNING`.

---

## 3. Script de creación del schema

Ejecutar como `SYS` o un usuario DBA:

```sql
-- Crear el usuario/schema
CREATE USER ELEARNING IDENTIFIED BY "CAMBIAR_ESTA_PASSWORD"
    DEFAULT TABLESPACE USERS
    TEMPORARY TABLESPACE TEMP
    QUOTA UNLIMITED ON USERS;

-- Otorgar privilegios
GRANT CREATE SESSION TO ELEARNING;
GRANT CREATE TABLE TO ELEARNING;
GRANT CREATE VIEW TO ELEARNING;
GRANT CREATE MATERIALIZED VIEW TO ELEARNING;
GRANT CREATE PROCEDURE TO ELEARNING;
GRANT CREATE TRIGGER TO ELEARNING;
GRANT CREATE SEQUENCE TO ELEARNING;
GRANT CREATE JOB TO ELEARNING;
GRANT QUERY REWRITE TO ELEARNING;

-- Privilegio para usar DBMS_SCHEDULER
GRANT EXECUTE ON DBMS_SCHEDULER TO ELEARNING;

-- Privilegio para refrescar materialized views
GRANT EXECUTE ON DBMS_MVIEW TO ELEARNING;

-- Permisos adicionales útiles
GRANT CREATE TYPE TO ELEARNING;
GRANT CREATE SYNONYM TO ELEARNING;
```

---

## 4. Datos de conexión requeridos

Una vez creado el schema, necesito:

| Dato | Ejemplo |
|---|---|
| **Host / Endpoint** | `oracle-rds.xxxx.us-east-1.rds.amazonaws.com` |
| **Puerto** | `1521` |
| **Service Name o SID** | `ORCL` o el service name configurado |
| **Usuario** | `ELEARNING` |
| **Password** | (por canal seguro) |
| **Connection String (TNS)** | `host:port/service_name` |

El connection string para Node.js será:
```
oracle-rds.xxxx.us-east-1.rds.amazonaws.com:1521/SERVICE_NAME
```

---

## 5. Objetos que se crearán dentro del schema

Una vez que tenga acceso, ejecutaré los siguientes scripts en orden:

| # | Script | Contenido | Objetos |
|---|---|---|---|
| 1 | `01-tables.sql` | Tablas, constraints, índices | 16 tablas, 40+ índices, 30+ constraints |
| 2 | `02-sequences-triggers.sql` | Función UUID, triggers | 1 función, 24 triggers |
| 3 | `03-materialized-views.sql` | Vistas materializadas, job | 4 mat. views, 1 scheduled job |
| 4 | `04-procedures-functions.sql` | Packages PL/SQL | 4 packages, 1 procedure standalone |

### Resumen de objetos:

| Tipo de objeto | Cantidad |
|---|---|
| Tablas | 16 |
| Índices | 40+ |
| Constraints (PK, FK, UK, CHK) | 60+ |
| Triggers | 24 (16 BI + 8 BU) |
| Funciones | 1 (fn_new_uuid) |
| Packages | 4 (PKG_RISK_ENGINE, PKG_ANALYTICS, PKG_AUDIT, PKG_AD_SYNC) |
| Procedures standalone | 1 (sp_ensure_admin_user) |
| Materialized Views | 4 |
| Scheduled Jobs | 1 (refresh hourly) |

---

## 6. Estimación de espacio

| Concepto | Estimación |
|---|---|
| Tablas + índices (inicial) | 50-100 MB |
| Crecimiento mensual (800 usuarios) | 20-50 MB |
| Materialized Views | 5-10 MB |
| Audit Log (1 año) | 200-500 MB |
| **Total primer año** | **~1-2 GB** |

---

## 7. Compatibilidad verificada con Oracle 19c

| Característica usada | Soporte en 19c |
|---|---|
| `SYS_GUID()` | Sí (desde Oracle 8i) |
| `TIMESTAMP WITH TIME ZONE` | Sí |
| `CLOB` para JSON | Sí (JSON functions desde 12c) |
| `DEFAULT value` en columnas | Sí |
| `MATERIALIZED VIEW` con `REFRESH COMPLETE ON DEMAND` | Sí |
| `DBMS_SCHEDULER` | Sí |
| `DBMS_MVIEW.REFRESH` | Sí |
| `FETCH FIRST N ROWS ONLY` | Sí (desde 12c) |
| `AUTONOMOUS_TRANSACTION` | Sí |
| `ON DELETE CASCADE / SET NULL` | Sí |
| PL/SQL Packages | Sí |
| `SYS.ODCIVARCHAR2LIST` collection type | Sí |

---

## 8. Configuración de red (si es RDS Oracle)

| Requisito | Detalle |
|---|---|
| **Security Group** | Permitir puerto 1521 desde el SG de la EC2 backend |
| **Acceso público** | NO |
| **SSL/TLS** | Recomendado (`TCPS` con wallet si está disponible) |
| **Character Set** | `AL32UTF8` (soporte completo de Unicode/español) |
| **NLS_DATE_FORMAT** | `YYYY-MM-DD HH24:MI:SS` |

---

## 9. Verificación post-creación

```sql
-- Conectar como ELEARNING
sqlplus ELEARNING/"password"@host:1521/service_name

-- Verificar privilegios
SELECT * FROM SESSION_PRIVS;

-- Verificar tablespace y quota
SELECT TABLESPACE_NAME, BYTES, MAX_BYTES FROM USER_TS_QUOTAS;

-- Verificar versión
SELECT * FROM V$VERSION;
```

---

## 10. Orden de ejecución de scripts

Una vez creado el schema y confirmado el acceso:

```bash
# Conectar al schema ELEARNING
sqlplus ELEARNING/"password"@host:1521/service_name

# Ejecutar en orden
@01-tables.sql
@02-sequences-triggers.sql
@03-materialized-views.sql
@04-procedures-functions.sql
```

O vía SQL*Plus desde línea de comandos:
```bash
sqlplus ELEARNING/"password"@host:1521/service_name @01-tables.sql
sqlplus ELEARNING/"password"@host:1521/service_name @02-sequences-triggers.sql
sqlplus ELEARNING/"password"@host:1521/service_name @03-materialized-views.sql
sqlplus ELEARNING/"password"@host:1521/service_name @04-procedures-functions.sql
```

---

## 11. Contacto

Para cualquier duda sobre esta solicitud:

- **Equipo:** [Tu equipo]
- **Email:** [Tu email]
- **Slack/Teams:** [Tu canal]

---

## 12. Archivos adjuntos

1. `oracle/01-tables.sql` — 16 tablas con constraints e índices
2. `oracle/02-sequences-triggers.sql` — Función UUID + 24 triggers
3. `oracle/03-materialized-views.sql` — 4 vistas materializadas + job programado
4. `oracle/04-procedures-functions.sql` — 4 packages PL/SQL + 1 procedure
5. `diagrama-er.md` — Diagrama Entidad-Relación en formato Mermaid

---

*Documento generado el 2026-07-20 para el proyecto eLearning AgroAmérica.*
