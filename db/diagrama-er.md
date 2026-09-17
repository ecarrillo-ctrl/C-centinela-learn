# eLearning AgroAmérica — Diagrama Entidad-Relación
## Base de datos: Oracle Database 19c Standard Edition 2

---

## Diagrama ER (Mermaid)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ ORG_UNITS : "contiene"
    ORG_UNITS ||--o{ ORG_UNITS : "sub-unidad"
    ORG_UNITS ||--o{ USERS : "pertenece"
    ORG_UNITS ||--o{ TRAINING_CAMPAIGNS : "alcance"
    ORG_UNITS ||--o{ PHISHING_CAMPAIGNS : "alcance"

    USERS ||--o{ TRAINING_ENROLLMENTS : "matriculado"
    USERS ||--o{ PHISHING_RESULTS : "tracking"
    USERS ||--o{ PAB_REPORTS : "reporta"
    USERS ||--o{ RISK_SCORE_EVENTS : "historial_riesgo"
    USERS ||--o{ USER_BADGES : "insignias"
    USERS ||--o{ AUDIT_LOG : "actor"
    USERS ||--o{ COURSES : "crea_contenido"

    COURSES ||--o{ LEARNING_PATH_COURSES : "incluido_en"
    COURSES ||--o{ TRAINING_ENROLLMENTS : "asignado"

    LEARNING_PATHS ||--o{ LEARNING_PATH_COURSES : "compuesto_por"
    LEARNING_PATHS ||--o{ TRAINING_CAMPAIGNS : "ruta_asignada"

    TRAINING_CAMPAIGNS ||--o{ TRAINING_ENROLLMENTS : "genera"

    PHISHING_TEMPLATES ||--o{ PHISHING_CAMPAIGNS : "plantilla"
    PHISHING_CAMPAIGNS ||--o{ PHISHING_RESULTS : "resultados"
    PHISHING_CAMPAIGNS ||--o{ PAB_REPORTS : "referencia"

    BADGES ||--o{ USER_BADGES : "otorgada"

    ORGANIZATIONS {
        VARCHAR2_36 ID PK
        VARCHAR2_255 NAME UK
        VARCHAR2_100 COUNTRY
        NUMBER_1 IS_ACTIVE
        TIMESTAMP CREATED_AT
        TIMESTAMP UPDATED_AT
    }

    ORG_UNITS {
        VARCHAR2_36 ID PK
        VARCHAR2_36 ORGANIZATION_ID FK
        VARCHAR2_36 PARENT_ID FK
        VARCHAR2_255 NAME
        VARCHAR2_1024 DN UK
        VARCHAR2_64 AD_OBJECT_GUID
        NUMBER_3 LEVEL_NUM
        TIMESTAMP CREATED_AT
        TIMESTAMP UPDATED_AT
    }

    USERS {
        VARCHAR2_36 ID PK
        VARCHAR2_64 AD_OBJECT_GUID UK
        VARCHAR2_255 EMAIL UK
        VARCHAR2_255 DISPLAY_NAME
        VARCHAR2_128 FIRST_NAME
        VARCHAR2_128 LAST_NAME
        VARCHAR2_255 JOB_TITLE
        VARCHAR2_255 DEPARTMENT
        VARCHAR2_36 ORG_UNIT_ID FK
        VARCHAR2_20 STATUS
        NUMBER_5_2 RISK_SCORE
        NUMBER_1 PHISH_PRONE
        VARCHAR2_255 PASSWORD_HASH
        NUMBER_1 IS_ADMIN
        TIMESTAMP CREATED_AT
        TIMESTAMP UPDATED_AT
        TIMESTAMP DEACTIVATED_AT
    }

    COURSES {
        VARCHAR2_36 ID PK
        VARCHAR2_500 TITLE
        CLOB DESCRIPTION
        VARCHAR2_20 LEVEL_TYPE
        VARCHAR2_20 COURSE_TYPE
        VARCHAR2_500 SOURCE_LICENSE
        VARCHAR2_2048 SOURCE_URL
        VARCHAR2_500 STORAGE_KEY
        VARCHAR2_500 EXTERNAL_ID
        NUMBER_6 DURATION_MIN
        NUMBER_1 IS_ACTIVE
        VARCHAR2_36 CREATED_BY FK
        TIMESTAMP CREATED_AT
        TIMESTAMP UPDATED_AT
        TIMESTAMP DELETED_AT
    }

    LEARNING_PATHS {
        VARCHAR2_36 ID PK
        VARCHAR2_500 NAME
        CLOB DESCRIPTION
        NUMBER_1 IS_ACTIVE
        TIMESTAMP CREATED_AT
        TIMESTAMP UPDATED_AT
    }

    LEARNING_PATH_COURSES {
        VARCHAR2_36 ID PK
        VARCHAR2_36 PATH_ID FK
        VARCHAR2_36 COURSE_ID FK
        NUMBER_5 SORT_ORDER
    }

    TRAINING_CAMPAIGNS {
        VARCHAR2_36 ID PK
        VARCHAR2_500 NAME
        CLOB DESCRIPTION
        VARCHAR2_36 ORG_UNIT_SCOPE FK
        VARCHAR2_36 PATH_ID FK
        TIMESTAMP START_AT
        TIMESTAMP DUE_AT
        NUMBER_1 IS_ONGOING
        VARCHAR2_36 CREATED_BY FK
        TIMESTAMP CREATED_AT
        TIMESTAMP UPDATED_AT
    }

    TRAINING_ENROLLMENTS {
        VARCHAR2_36 ID PK
        VARCHAR2_36 USER_ID FK
        VARCHAR2_36 CAMPAIGN_ID FK
        VARCHAR2_36 COURSE_ID FK
        VARCHAR2_20 STATUS
        NUMBER_5_2 PROGRESS_PCT
        NUMBER_5_2 SCORE
        TIMESTAMP STARTED_AT
        TIMESTAMP COMPLETED_AT
        NUMBER_10 TIME_SPENT_SEC
        TIMESTAMP CREATED_AT
    }

    PHISHING_TEMPLATES {
        VARCHAR2_36 ID PK
        VARCHAR2_500 NAME
        VARCHAR2_500 SUBJECT
        CLOB HTML_BODY
        CLOB TEXT_BODY
        CLOB RED_FLAGS_JSON
        VARCHAR2_50 DIFFICULTY
        VARCHAR2_100 CATEGORY
        NUMBER_1 IS_ACTIVE
        VARCHAR2_36 CREATED_BY FK
        TIMESTAMP CREATED_AT
        TIMESTAMP UPDATED_AT
    }

    PHISHING_CAMPAIGNS {
        VARCHAR2_36 ID PK
        VARCHAR2_500 NAME
        VARCHAR2_36 TEMPLATE_ID FK
        VARCHAR2_36 ORG_UNIT_SCOPE FK
        CLOB SMART_GROUP_RULE
        TIMESTAMP SENT_AT
        VARCHAR2_2048 LANDING_URL
        VARCHAR2_50 STATUS
        VARCHAR2_36 AUTHORIZED_BY FK
        VARCHAR2_36 CREATED_BY FK
        TIMESTAMP CREATED_AT
        TIMESTAMP UPDATED_AT
    }

    PHISHING_RESULTS {
        VARCHAR2_36 ID PK
        VARCHAR2_36 USER_ID FK
        VARCHAR2_36 CAMPAIGN_ID FK
        VARCHAR2_30 EVENT
        TIMESTAMP EVENT_AT
        VARCHAR2_45 IP
        VARCHAR2_1000 USER_AGENT
        VARCHAR2_512 TRACKING_TOKEN
    }

    PAB_REPORTS {
        VARCHAR2_36 ID PK
        VARCHAR2_36 USER_ID FK
        VARCHAR2_500 REPORTED_SUBJECT
        VARCHAR2_255 REPORTED_FROM
        NUMBER_1 WAS_SIMULATED
        VARCHAR2_36 CAMPAIGN_ID FK
        TIMESTAMP REPORTED_AT
        TIMESTAMP CREATED_AT
    }

    RISK_SCORE_EVENTS {
        VARCHAR2_36 ID PK
        VARCHAR2_36 USER_ID FK
        NUMBER_5_2 DELTA
        VARCHAR2_1000 REASON
        VARCHAR2_20 SOURCE
        VARCHAR2_36 REFERENCE_ID
        TIMESTAMP CREATED_AT
    }

    BADGES {
        VARCHAR2_36 ID PK
        VARCHAR2_255 NAME
        CLOB DESCRIPTION
        VARCHAR2_500 ICON_URL
        CLOB CRITERIA_JSON
        TIMESTAMP CREATED_AT
    }

    USER_BADGES {
        VARCHAR2_36 ID PK
        VARCHAR2_36 USER_ID FK
        VARCHAR2_36 BADGE_ID FK
        TIMESTAMP EARNED_AT
    }

    AUDIT_LOG {
        VARCHAR2_36 ID PK
        VARCHAR2_36 ACTOR_ID FK
        VARCHAR2_255 ACTION
        VARCHAR2_100 ENTITY_TYPE
        VARCHAR2_36 ENTITY_ID
        CLOB DETAILS_JSON
        VARCHAR2_45 IP
        TIMESTAMP CREATED_AT
    }
```

---

## Resumen de Entidades (16 tablas)

| # | Tabla | Descripción | Registros estimados |
|---|---|---|---|
| 1 | ORGANIZATIONS | Empresas del grupo AgroAmérica | 5-10 |
| 2 | ORG_UNITS | Unidades organizacionales del AD | 50-200 |
| 3 | USERS | Usuarios (sincronizados desde AD) | 800-5,000 |
| 4 | COURSES | Catálogo de capacitaciones | 50-500 |
| 5 | LEARNING_PATHS | Rutas de aprendizaje | 10-50 |
| 6 | LEARNING_PATH_COURSES | Cursos dentro de rutas (puente) | 100-500 |
| 7 | TRAINING_CAMPAIGNS | Campañas de capacitación | 20-100 |
| 8 | TRAINING_ENROLLMENTS | Matrículas/progreso de usuarios | 5,000-50,000 |
| 9 | PHISHING_TEMPLATES | Plantillas de phishing simulado | 20-100 |
| 10 | PHISHING_CAMPAIGNS | Campañas de phishing | 50-200 |
| 11 | PHISHING_RESULTS | Eventos de tracking | 5,000-50,000 |
| 12 | PAB_REPORTS | Reportes del Phish Alert Button | 500-5,000 |
| 13 | RISK_SCORE_EVENTS | Log inmutable de risk score (BASC) | 10,000-100,000 |
| 14 | BADGES | Insignias de gamificación | 10-30 |
| 15 | USER_BADGES | Insignias otorgadas | 1,000-10,000 |
| 16 | AUDIT_LOG | Registro de auditoría BASC | 50,000-500,000 |

---

## Cardinalidades

| Relación | Tipo | Descripción |
|---|---|---|
| ORGANIZATIONS → ORG_UNITS | 1:N | Cada empresa tiene múltiples OUs |
| ORG_UNITS → ORG_UNITS | 1:N | Jerarquía padre-hijo (auto-referencia) |
| ORG_UNITS → USERS | 1:N | Cada OU tiene múltiples usuarios |
| USERS → TRAINING_ENROLLMENTS | 1:N | Un usuario tiene muchas matrículas |
| USERS → PHISHING_RESULTS | 1:N | Un usuario tiene muchos eventos de tracking |
| USERS → RISK_SCORE_EVENTS | 1:N | Historial inmutable de cambios de riesgo |
| USERS → PAB_REPORTS | 1:N | Un usuario puede reportar muchos correos |
| USERS → USER_BADGES | 1:N | Un usuario gana múltiples insignias |
| COURSES → TRAINING_ENROLLMENTS | 1:N | Un curso tiene muchos matriculados |
| LEARNING_PATHS → LEARNING_PATH_COURSES | 1:N | Una ruta tiene cursos ordenados |
| TRAINING_CAMPAIGNS → TRAINING_ENROLLMENTS | 1:N | Una campaña genera matrículas |
| PHISHING_TEMPLATES → PHISHING_CAMPAIGNS | 1:N | Una plantilla se usa en varias campañas |
| PHISHING_CAMPAIGNS → PHISHING_RESULTS | 1:N | Una campaña genera eventos de tracking |
| BADGES → USER_BADGES | 1:N | Una insignia se otorga a muchos usuarios |

---

## Vistas Materializadas (4)

| Vista | Descripción | Refresh |
|---|---|---|
| MV_OU_RISK | Riesgo promedio por unidad organizacional | Cada hora |
| MV_ORG_RISK | Riesgo promedio por organización | Cada hora |
| MV_CAMPAIGN_STATS | Estadísticas de campañas de phishing | Cada hora |
| MV_TRAINING_PROGRESS | Progreso de capacitación por OU | Cada hora |

---

## Packages PL/SQL (4)

| Package | Descripción |
|---|---|
| PKG_RISK_ENGINE | Motor de riesgo con decay exponencial |
| PKG_ANALYTICS | Refresh de vistas y consultas de dashboard |
| PKG_AUDIT | Registro de auditoría (autonomous transaction) |
| PKG_AD_SYNC | Sincronización con Active Directory |
