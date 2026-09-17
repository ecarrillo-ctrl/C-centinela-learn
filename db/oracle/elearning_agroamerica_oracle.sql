-- =============================================================================
-- eLearning AgroAmérica — Script Completo para Oracle 19c / 21c
-- =============================================================================
-- Base de datos: Oracle Database 19c Standard Edition 2
--                Release 19.0.0.0.0 - Production
-- =============================================================================
-- CONTENIDO:
--   1. Función auxiliar UUID
--   2. Tablas (16) con PK, FK, UNIQUE, CHECK
--   3. Índices
--   4. Triggers BEFORE INSERT (generación UUID + timestamps)
--   5. Triggers BEFORE UPDATE (updated_at automático)
--   6. Vistas Materializadas (4)
--   7. Job programado (DBMS_SCHEDULER)
--   8. Packages PL/SQL (4)
--   9. Procedimiento standalone (admin seed)
-- =============================================================================
-- EJECUCIÓN:
--   sqlplus ELEARNING/"password"@host:1521/service @elearning_agroamerica_oracle.sql
-- =============================================================================

SET DEFINE OFF;
SET SERVEROUTPUT ON;

WHENEVER SQLERROR CONTINUE;

-- =============================================================================
-- SECCIÓN 1: FUNCIÓN AUXILIAR — Generador de UUID formateado
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_new_uuid RETURN VARCHAR2 IS
    v_raw RAW(16);
    v_hex VARCHAR2(32);
BEGIN
    v_raw := SYS_GUID();
    v_hex := RAWTOHEX(v_raw);
    RETURN LOWER(
        SUBSTR(v_hex, 1, 8) || '-' ||
        SUBSTR(v_hex, 9, 4) || '-' ||
        SUBSTR(v_hex, 13, 4) || '-' ||
        SUBSTR(v_hex, 17, 4) || '-' ||
        SUBSTR(v_hex, 21, 12)
    );
END fn_new_uuid;
/

-- =============================================================================
-- SECCIÓN 2: TABLAS
-- =============================================================================

-- 1. ORGANIZATIONS
CREATE TABLE organizations (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    name            VARCHAR2(255)   NOT NULL,
    country         VARCHAR2(100),
    is_active       NUMBER(1)       DEFAULT 1 NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_organizations PRIMARY KEY (id),
    CONSTRAINT uk_organizations_name UNIQUE (name),
    CONSTRAINT chk_org_active CHECK (is_active IN (0, 1))
);
COMMENT ON TABLE organizations IS 'Empresas del grupo AgroAmérica';

-- 2. ORG_UNITS
CREATE TABLE org_units (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    organization_id VARCHAR2(36)    NOT NULL,
    parent_id       VARCHAR2(36),
    name            VARCHAR2(255)   NOT NULL,
    dn              VARCHAR2(1024)  NOT NULL,
    ad_object_guid  VARCHAR2(64),
    level_num       NUMBER(3)       DEFAULT 0 NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_org_units PRIMARY KEY (id),
    CONSTRAINT uk_org_units_dn UNIQUE (dn),
    CONSTRAINT fk_ou_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_ou_parent FOREIGN KEY (parent_id) REFERENCES org_units(id) ON DELETE SET NULL
);
COMMENT ON TABLE org_units IS 'Unidades organizacionales del Active Directory (jerárquicas)';
CREATE INDEX idx_ou_org ON org_units(organization_id);
CREATE INDEX idx_ou_parent ON org_units(parent_id);

-- 3. USERS
CREATE TABLE users (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    ad_object_guid  VARCHAR2(64),
    email           VARCHAR2(255)   NOT NULL,
    display_name    VARCHAR2(255)   NOT NULL,
    first_name      VARCHAR2(128),
    last_name       VARCHAR2(128),
    job_title       VARCHAR2(255),
    department      VARCHAR2(255),
    org_unit_id     VARCHAR2(36),
    status          VARCHAR2(20)    DEFAULT 'active' NOT NULL,
    risk_score      NUMBER(5,2)     DEFAULT 0 NOT NULL,
    phish_prone     NUMBER(1)       DEFAULT 0 NOT NULL,
    password_hash   VARCHAR2(255),
    is_admin        NUMBER(1)       DEFAULT 0 NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    deactivated_at  TIMESTAMP WITH TIME ZONE,
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uk_users_email UNIQUE (email),
    CONSTRAINT uk_users_ad_guid UNIQUE (ad_object_guid),
    CONSTRAINT fk_users_ou FOREIGN KEY (org_unit_id) REFERENCES org_units(id) ON DELETE SET NULL,
    CONSTRAINT chk_users_status CHECK (status IN ('active', 'inactive')),
    CONSTRAINT chk_users_risk CHECK (risk_score >= 0 AND risk_score <= 100),
    CONSTRAINT chk_users_phish CHECK (phish_prone IN (0, 1)),
    CONSTRAINT chk_users_admin CHECK (is_admin IN (0, 1))
);
COMMENT ON TABLE users IS 'Usuarios sincronizados desde Active Directory';
CREATE INDEX idx_users_ou ON users(org_unit_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_risk ON users(risk_score DESC);
CREATE INDEX idx_users_phish ON users(phish_prone);

-- 4. COURSES
CREATE TABLE courses (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    title           VARCHAR2(500)   NOT NULL,
    description     CLOB,
    level_type      VARCHAR2(20)    DEFAULT 'basico' NOT NULL,
    course_type     VARCHAR2(20)    NOT NULL,
    source_license  VARCHAR2(500),
    source_url      VARCHAR2(2048),
    storage_key     VARCHAR2(500),
    external_id     VARCHAR2(500),
    duration_min    NUMBER(6)       DEFAULT 0,
    is_active       NUMBER(1)       DEFAULT 1 NOT NULL,
    created_by      VARCHAR2(36),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    deleted_at      TIMESTAMP WITH TIME ZONE,
    CONSTRAINT pk_courses PRIMARY KEY (id),
    CONSTRAINT fk_courses_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_courses_level CHECK (level_type IN ('basico', 'intermedio', 'avanzado')),
    CONSTRAINT chk_courses_type CHECK (course_type IN ('scorm','video_embed','video_upload','pdf','presentation','image','audio','document')),
    CONSTRAINT chk_courses_active CHECK (is_active IN (0, 1))
);
COMMENT ON TABLE courses IS 'Catálogo de material de capacitación';
CREATE INDEX idx_courses_level ON courses(level_type);
CREATE INDEX idx_courses_type ON courses(course_type);
CREATE INDEX idx_courses_active ON courses(is_active);

-- 5. LEARNING_PATHS
CREATE TABLE learning_paths (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    name            VARCHAR2(500)   NOT NULL,
    description     CLOB,
    is_active       NUMBER(1)       DEFAULT 1 NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_learning_paths PRIMARY KEY (id),
    CONSTRAINT chk_lp_active CHECK (is_active IN (0, 1))
);
COMMENT ON TABLE learning_paths IS 'Rutas de aprendizaje con cursos ordenados';

-- 6. LEARNING_PATH_COURSES
CREATE TABLE learning_path_courses (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    path_id         VARCHAR2(36)    NOT NULL,
    course_id       VARCHAR2(36)    NOT NULL,
    sort_order      NUMBER(5)       DEFAULT 0 NOT NULL,
    CONSTRAINT pk_lpc PRIMARY KEY (id),
    CONSTRAINT uk_lpc UNIQUE (path_id, course_id),
    CONSTRAINT fk_lpc_path FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
    CONSTRAINT fk_lpc_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX idx_lpc_path ON learning_path_courses(path_id);

-- 7. TRAINING_CAMPAIGNS
CREATE TABLE training_campaigns (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    name            VARCHAR2(500)   NOT NULL,
    description     CLOB,
    org_unit_scope  VARCHAR2(36),
    path_id         VARCHAR2(36),
    start_at        TIMESTAMP WITH TIME ZONE,
    due_at          TIMESTAMP WITH TIME ZONE,
    is_ongoing      NUMBER(1)       DEFAULT 0 NOT NULL,
    created_by      VARCHAR2(36),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_training_campaigns PRIMARY KEY (id),
    CONSTRAINT fk_tc_ou FOREIGN KEY (org_unit_scope) REFERENCES org_units(id),
    CONSTRAINT fk_tc_path FOREIGN KEY (path_id) REFERENCES learning_paths(id),
    CONSTRAINT fk_tc_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_tc_ongoing CHECK (is_ongoing IN (0, 1))
);
CREATE INDEX idx_tc_ou ON training_campaigns(org_unit_scope);
CREATE INDEX idx_tc_ongoing ON training_campaigns(is_ongoing);

-- 8. TRAINING_ENROLLMENTS
CREATE TABLE training_enrollments (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    user_id         VARCHAR2(36)    NOT NULL,
    campaign_id     VARCHAR2(36),
    course_id       VARCHAR2(36)    NOT NULL,
    status          VARCHAR2(20)    DEFAULT 'assigned' NOT NULL,
    progress_pct    NUMBER(5,2)     DEFAULT 0 NOT NULL,
    score           NUMBER(5,2),
    started_at      TIMESTAMP WITH TIME ZONE,
    completed_at    TIMESTAMP WITH TIME ZONE,
    time_spent_sec  NUMBER(10)      DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_training_enrollments PRIMARY KEY (id),
    CONSTRAINT uk_te UNIQUE (user_id, course_id, campaign_id),
    CONSTRAINT fk_te_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_te_campaign FOREIGN KEY (campaign_id) REFERENCES training_campaigns(id) ON DELETE SET NULL,
    CONSTRAINT fk_te_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT chk_te_status CHECK (status IN ('assigned', 'in_progress', 'completed')),
    CONSTRAINT chk_te_progress CHECK (progress_pct >= 0 AND progress_pct <= 100)
);
CREATE INDEX idx_te_user ON training_enrollments(user_id);
CREATE INDEX idx_te_campaign ON training_enrollments(campaign_id);
CREATE INDEX idx_te_course ON training_enrollments(course_id);
CREATE INDEX idx_te_status ON training_enrollments(status);

-- 9. PHISHING_TEMPLATES
CREATE TABLE phishing_templates (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    name            VARCHAR2(500)   NOT NULL,
    subject         VARCHAR2(500)   NOT NULL,
    html_body       CLOB            NOT NULL,
    text_body       CLOB,
    red_flags_json  CLOB            DEFAULT '[]',
    difficulty      VARCHAR2(50)    DEFAULT 'medium' NOT NULL,
    category        VARCHAR2(100),
    is_active       NUMBER(1)       DEFAULT 1 NOT NULL,
    created_by      VARCHAR2(36),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_phishing_templates PRIMARY KEY (id),
    CONSTRAINT fk_pt_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_pt_diff CHECK (difficulty IN ('easy', 'medium', 'hard')),
    CONSTRAINT chk_pt_active CHECK (is_active IN (0, 1))
);
CREATE INDEX idx_pt_active ON phishing_templates(is_active);

-- 10. PHISHING_CAMPAIGNS
CREATE TABLE phishing_campaigns (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    name            VARCHAR2(500)   NOT NULL,
    template_id     VARCHAR2(36)    NOT NULL,
    org_unit_scope  VARCHAR2(36),
    smart_group_rule CLOB,
    sent_at         TIMESTAMP WITH TIME ZONE,
    landing_url     VARCHAR2(2048),
    status          VARCHAR2(50)    DEFAULT 'draft' NOT NULL,
    authorized_by   VARCHAR2(36),
    created_by      VARCHAR2(36),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_phishing_campaigns PRIMARY KEY (id),
    CONSTRAINT fk_pc_template FOREIGN KEY (template_id) REFERENCES phishing_templates(id),
    CONSTRAINT fk_pc_ou FOREIGN KEY (org_unit_scope) REFERENCES org_units(id),
    CONSTRAINT fk_pc_auth FOREIGN KEY (authorized_by) REFERENCES users(id),
    CONSTRAINT fk_pc_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_pc_status CHECK (status IN ('draft','scheduled','sending','completed'))
);
CREATE INDEX idx_pc_scope ON phishing_campaigns(org_unit_scope);
CREATE INDEX idx_pc_status ON phishing_campaigns(status);

-- 11. PHISHING_RESULTS
CREATE TABLE phishing_results (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    user_id         VARCHAR2(36)    NOT NULL,
    campaign_id     VARCHAR2(36)    NOT NULL,
    event           VARCHAR2(30)    NOT NULL,
    event_at        TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    ip              VARCHAR2(45),
    user_agent      VARCHAR2(1000),
    tracking_token  VARCHAR2(512),
    CONSTRAINT pk_phishing_results PRIMARY KEY (id),
    CONSTRAINT uk_pr UNIQUE (user_id, campaign_id, event),
    CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_campaign FOREIGN KEY (campaign_id) REFERENCES phishing_campaigns(id) ON DELETE CASCADE,
    CONSTRAINT chk_pr_event CHECK (event IN ('delivered','opened','clicked','reported','attachment_opened','replied','data_entered'))
);
CREATE INDEX idx_pr_user ON phishing_results(user_id);
CREATE INDEX idx_pr_campaign ON phishing_results(campaign_id);
CREATE INDEX idx_pr_event ON phishing_results(event);
CREATE INDEX idx_pr_event_at ON phishing_results(event_at);

-- 12. PAB_REPORTS
CREATE TABLE pab_reports (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    user_id         VARCHAR2(36)    NOT NULL,
    reported_subject VARCHAR2(500)  NOT NULL,
    reported_from   VARCHAR2(255),
    was_simulated   NUMBER(1)       DEFAULT 0 NOT NULL,
    campaign_id     VARCHAR2(36),
    reported_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_pab_reports PRIMARY KEY (id),
    CONSTRAINT fk_pab_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_pab_campaign FOREIGN KEY (campaign_id) REFERENCES phishing_campaigns(id),
    CONSTRAINT chk_pab_sim CHECK (was_simulated IN (0, 1))
);
CREATE INDEX idx_pab_user ON pab_reports(user_id);
CREATE INDEX idx_pab_sim ON pab_reports(was_simulated);
CREATE INDEX idx_pab_reported ON pab_reports(reported_at);

-- 13. RISK_SCORE_EVENTS
CREATE TABLE risk_score_events (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    user_id         VARCHAR2(36)    NOT NULL,
    delta           NUMBER(5,2)     NOT NULL,
    reason          VARCHAR2(1000)  NOT NULL,
    source          VARCHAR2(20)    NOT NULL,
    reference_id    VARCHAR2(36),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_risk_score_events PRIMARY KEY (id),
    CONSTRAINT fk_rse_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_rse_source CHECK (source IN ('phishing','training','pab','manual','decay'))
);
CREATE INDEX idx_rse_user ON risk_score_events(user_id);
CREATE INDEX idx_rse_source ON risk_score_events(source);
CREATE INDEX idx_rse_created ON risk_score_events(created_at);

-- 14. BADGES
CREATE TABLE badges (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    name            VARCHAR2(255)   NOT NULL,
    description     CLOB,
    icon_url        VARCHAR2(500),
    criteria_json   CLOB,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_badges PRIMARY KEY (id)
);

-- 15. USER_BADGES
CREATE TABLE user_badges (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    user_id         VARCHAR2(36)    NOT NULL,
    badge_id        VARCHAR2(36)    NOT NULL,
    earned_at       TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_user_badges PRIMARY KEY (id),
    CONSTRAINT uk_ub UNIQUE (user_id, badge_id),
    CONSTRAINT fk_ub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ub_badge FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
);
CREATE INDEX idx_ub_user ON user_badges(user_id);

-- 16. AUDIT_LOG
CREATE TABLE audit_log (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    actor_id        VARCHAR2(36),
    action          VARCHAR2(255)   NOT NULL,
    entity_type     VARCHAR2(100),
    entity_id       VARCHAR2(36),
    details_json    CLOB,
    ip              VARCHAR2(45),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_audit_log PRIMARY KEY (id),
    CONSTRAINT fk_al_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_al_actor ON audit_log(actor_id);
CREATE INDEX idx_al_action ON audit_log(action);
CREATE INDEX idx_al_created ON audit_log(created_at);
CREATE INDEX idx_al_entity ON audit_log(entity_type, entity_id);

-- =============================================================================
-- SECCIÓN 3: TRIGGERS BEFORE INSERT (UUID + timestamps)
-- =============================================================================

CREATE OR REPLACE TRIGGER trg_organizations_bi
BEFORE INSERT ON organizations FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_org_units_bi
BEFORE INSERT ON org_units FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_users_bi
BEFORE INSERT ON users FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_courses_bi
BEFORE INSERT ON courses FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_learning_paths_bi
BEFORE INSERT ON learning_paths FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_lpc_bi
BEFORE INSERT ON learning_path_courses FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
END;
/
CREATE OR REPLACE TRIGGER trg_training_campaigns_bi
BEFORE INSERT ON training_campaigns FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_training_enrollments_bi
BEFORE INSERT ON training_enrollments FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_phishing_templates_bi
BEFORE INSERT ON phishing_templates FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_phishing_campaigns_bi
BEFORE INSERT ON phishing_campaigns FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_phishing_results_bi
BEFORE INSERT ON phishing_results FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    IF :NEW.event_at IS NULL THEN :NEW.event_at := SYSTIMESTAMP; END IF;
END;
/
CREATE OR REPLACE TRIGGER trg_pab_reports_bi
BEFORE INSERT ON pab_reports FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP;
    IF :NEW.reported_at IS NULL THEN :NEW.reported_at := SYSTIMESTAMP; END IF;
END;
/
CREATE OR REPLACE TRIGGER trg_risk_score_events_bi
BEFORE INSERT ON risk_score_events FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_badges_bi
BEFORE INSERT ON badges FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_user_badges_bi
BEFORE INSERT ON user_badges FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    IF :NEW.earned_at IS NULL THEN :NEW.earned_at := SYSTIMESTAMP; END IF;
END;
/
CREATE OR REPLACE TRIGGER trg_audit_log_bi
BEFORE INSERT ON audit_log FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP;
END;
/

-- =============================================================================
-- SECCIÓN 4: TRIGGERS BEFORE UPDATE (updated_at automático)
-- =============================================================================

CREATE OR REPLACE TRIGGER trg_organizations_bu
BEFORE UPDATE ON organizations FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_org_units_bu
BEFORE UPDATE ON org_units FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_users_bu
BEFORE UPDATE ON users FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_courses_bu
BEFORE UPDATE ON courses FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_learning_paths_bu
BEFORE UPDATE ON learning_paths FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_training_campaigns_bu
BEFORE UPDATE ON training_campaigns FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_phishing_templates_bu
BEFORE UPDATE ON phishing_templates FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_phishing_campaigns_bu
BEFORE UPDATE ON phishing_campaigns FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/

-- =============================================================================
-- SECCIÓN 5: VISTAS MATERIALIZADAS
-- =============================================================================

CREATE MATERIALIZED VIEW mv_ou_risk
BUILD IMMEDIATE REFRESH COMPLETE ON DEMAND ENABLE QUERY REWRITE
AS
SELECT ou.id AS org_unit_id, ou.name AS org_unit_name, ou.organization_id,
    COUNT(u.id) AS total_users,
    COUNT(CASE WHEN u.status='active' THEN u.id END) AS active_users,
    ROUND(AVG(CASE WHEN u.status='active' THEN u.risk_score END),2) AS avg_risk_score,
    COUNT(CASE WHEN u.phish_prone=1 AND u.status='active' THEN u.id END) AS phish_prone_count,
    ROUND(COUNT(CASE WHEN u.phish_prone=1 AND u.status='active' THEN u.id END)*100.0
        /NULLIF(COUNT(CASE WHEN u.status='active' THEN u.id END),0),2) AS phish_prone_pct
FROM org_units ou LEFT JOIN users u ON u.org_unit_id=ou.id
GROUP BY ou.id, ou.name, ou.organization_id;

CREATE UNIQUE INDEX idx_mv_our_pk ON mv_ou_risk(org_unit_id);

CREATE MATERIALIZED VIEW mv_org_risk
BUILD IMMEDIATE REFRESH COMPLETE ON DEMAND ENABLE QUERY REWRITE
AS
SELECT o.id AS organization_id, o.name AS organization_name,
    COUNT(DISTINCT u.id) AS total_users,
    COUNT(DISTINCT CASE WHEN u.status='active' THEN u.id END) AS active_users,
    ROUND(AVG(CASE WHEN u.status='active' THEN u.risk_score END),2) AS avg_risk_score,
    COUNT(DISTINCT CASE WHEN u.phish_prone=1 AND u.status='active' THEN u.id END) AS phish_prone_count,
    ROUND(COUNT(DISTINCT CASE WHEN u.phish_prone=1 AND u.status='active' THEN u.id END)*100.0
        /NULLIF(COUNT(DISTINCT CASE WHEN u.status='active' THEN u.id END),0),2) AS phish_prone_pct
FROM organizations o LEFT JOIN org_units ou ON ou.organization_id=o.id
LEFT JOIN users u ON u.org_unit_id=ou.id
GROUP BY o.id, o.name;

CREATE UNIQUE INDEX idx_mv_orgr_pk ON mv_org_risk(organization_id);

CREATE MATERIALIZED VIEW mv_campaign_stats
BUILD IMMEDIATE REFRESH COMPLETE ON DEMAND ENABLE QUERY REWRITE
AS
SELECT pc.id AS campaign_id, pc.name AS campaign_name, pc.status AS campaign_status, pc.sent_at,
    pt.name AS template_name, pt.difficulty,
    COUNT(DISTINCT pr.user_id) AS total_recipients,
    COUNT(CASE WHEN pr.event='clicked' THEN 1 END) AS clicks,
    COUNT(CASE WHEN pr.event='reported' THEN 1 END) AS reports,
    ROUND(COUNT(CASE WHEN pr.event='clicked' THEN 1 END)*100.0
        /NULLIF(COUNT(DISTINCT pr.user_id),0),2) AS click_rate_pct
FROM phishing_campaigns pc JOIN phishing_templates pt ON pc.template_id=pt.id
LEFT JOIN phishing_results pr ON pr.campaign_id=pc.id
GROUP BY pc.id, pc.name, pc.status, pc.sent_at, pt.name, pt.difficulty;

CREATE UNIQUE INDEX idx_mv_cs_pk ON mv_campaign_stats(campaign_id);

CREATE MATERIALIZED VIEW mv_training_progress
BUILD IMMEDIATE REFRESH COMPLETE ON DEMAND ENABLE QUERY REWRITE
AS
SELECT ou.id AS org_unit_id, ou.name AS org_unit_name, ou.organization_id,
    COUNT(DISTINCT te.user_id) AS users_enrolled,
    COUNT(te.id) AS total_enrollments,
    COUNT(CASE WHEN te.status='completed' THEN 1 END) AS completed,
    ROUND(COUNT(CASE WHEN te.status='completed' THEN 1 END)*100.0
        /NULLIF(COUNT(te.id),0),2) AS completion_rate_pct,
    ROUND(AVG(te.progress_pct),2) AS avg_progress_pct
FROM org_units ou LEFT JOIN users u ON u.org_unit_id=ou.id AND u.status='active'
LEFT JOIN training_enrollments te ON te.user_id=u.id
GROUP BY ou.id, ou.name, ou.organization_id;

CREATE UNIQUE INDEX idx_mv_tp_pk ON mv_training_progress(org_unit_id);

-- =============================================================================
-- SECCIÓN 6: JOB PROGRAMADO — Refresh de vistas cada hora
-- =============================================================================
BEGIN
    BEGIN DBMS_SCHEDULER.DROP_JOB(job_name=>'JOB_REFRESH_MV',force=>TRUE);
    EXCEPTION WHEN OTHERS THEN NULL; END;

    DBMS_SCHEDULER.CREATE_JOB(
        job_name        => 'JOB_REFRESH_MV',
        job_type        => 'PLSQL_BLOCK',
        job_action      => 'BEGIN
            DBMS_MVIEW.REFRESH(''MV_OU_RISK'',''C'');
            DBMS_MVIEW.REFRESH(''MV_ORG_RISK'',''C'');
            DBMS_MVIEW.REFRESH(''MV_CAMPAIGN_STATS'',''C'');
            DBMS_MVIEW.REFRESH(''MV_TRAINING_PROGRESS'',''C'');
        END;',
        start_date      => SYSTIMESTAMP,
        repeat_interval => 'FREQ=HOURLY;INTERVAL=1',
        enabled         => TRUE,
        comments        => 'Refresca vistas materializadas de analitica cada hora'
    );
END;
/

-- =============================================================================
-- SECCIÓN 7: PACKAGE PKG_RISK_ENGINE — Motor de riesgo
-- =============================================================================
CREATE OR REPLACE PACKAGE pkg_risk_engine AS
    PROCEDURE apply_risk_event(
        p_user_id IN VARCHAR2, p_delta IN NUMBER, p_reason IN VARCHAR2,
        p_source IN VARCHAR2, p_reference_id IN VARCHAR2 DEFAULT NULL,
        p_new_score OUT NUMBER);
    FUNCTION recalculate_user_score(p_user_id IN VARCHAR2) RETURN NUMBER;
    PROCEDURE mark_phish_prone(p_user_id IN VARCHAR2, p_campaign_id IN VARCHAR2);
    PROCEDURE get_rule(p_event_type IN VARCHAR2, p_delta OUT NUMBER, p_reason OUT VARCHAR2, p_source OUT VARCHAR2);
END pkg_risk_engine;
/

CREATE OR REPLACE PACKAGE BODY pkg_risk_engine AS
    c_half_life CONSTANT NUMBER := 90;
    c_min CONSTANT NUMBER := 0;
    c_max CONSTANT NUMBER := 100;

    PROCEDURE get_rule(p_event_type IN VARCHAR2, p_delta OUT NUMBER, p_reason OUT VARCHAR2, p_source OUT VARCHAR2) IS
    BEGIN
        CASE p_event_type
            WHEN 'phishing_clicked' THEN p_delta:=15; p_reason:='Clic en phishing simulado'; p_source:='phishing';
            WHEN 'phishing_attachment_opened' THEN p_delta:=25; p_reason:='Apertura de adjunto en phishing'; p_source:='phishing';
            WHEN 'phishing_data_entered' THEN p_delta:=30; p_reason:='Envio de datos en phishing'; p_source:='phishing';
            WHEN 'phishing_replied' THEN p_delta:=28; p_reason:='Respuesta a phishing'; p_source:='phishing';
            WHEN 'pab_report_simulated' THEN p_delta:=-10; p_reason:='Reporte PAB (simulado)'; p_source:='pab';
            WHEN 'pab_report_real' THEN p_delta:=-5; p_reason:='Reporte PAB (real)'; p_source:='pab';
            WHEN 'training_completed' THEN p_delta:=-8; p_reason:='Capacitacion completada'; p_source:='training';
            WHEN 'training_path_completed' THEN p_delta:=-15; p_reason:='Ruta completada'; p_source:='training';
            ELSE p_delta:=0; p_reason:='Desconocido'; p_source:='manual';
        END CASE;
    END get_rule;

    FUNCTION recalculate_user_score(p_user_id IN VARCHAR2) RETURN NUMBER IS
        v_score NUMBER := 0;
        v_age NUMBER;
        CURSOR c_ev IS SELECT delta, created_at FROM risk_score_events WHERE user_id=p_user_id ORDER BY created_at;
    BEGIN
        FOR r IN c_ev LOOP
            v_age := (CAST(SYSTIMESTAMP AS DATE)-CAST(r.created_at AS DATE));
            IF r.delta > 0 THEN
                v_score := v_score + r.delta * POWER(0.5, v_age/c_half_life);
            ELSE
                v_score := v_score + r.delta;
            END IF;
        END LOOP;
        v_score := GREATEST(c_min, LEAST(c_max, ROUND(v_score,2)));
        UPDATE users SET risk_score=v_score WHERE id=p_user_id;
        RETURN v_score;
    END recalculate_user_score;

    PROCEDURE apply_risk_event(
        p_user_id IN VARCHAR2, p_delta IN NUMBER, p_reason IN VARCHAR2,
        p_source IN VARCHAR2, p_reference_id IN VARCHAR2 DEFAULT NULL,
        p_new_score OUT NUMBER) IS
    BEGIN
        INSERT INTO risk_score_events(user_id,delta,reason,source,reference_id)
        VALUES(p_user_id,p_delta,p_reason,p_source,p_reference_id);
        p_new_score := recalculate_user_score(p_user_id);
        COMMIT;
    END apply_risk_event;

    PROCEDURE mark_phish_prone(p_user_id IN VARCHAR2, p_campaign_id IN VARCHAR2) IS
        v_cnt NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_cnt FROM phishing_results
        WHERE user_id=p_user_id AND campaign_id=p_campaign_id AND event='clicked';
        UPDATE users SET phish_prone=CASE WHEN v_cnt>0 THEN 1 ELSE 0 END WHERE id=p_user_id;
        COMMIT;
    END mark_phish_prone;
END pkg_risk_engine;
/

-- =============================================================================
-- SECCIÓN 8: PACKAGE PKG_ANALYTICS — Dashboard y refresh
-- =============================================================================
CREATE OR REPLACE PACKAGE pkg_analytics AS
    PROCEDURE refresh_all_views;
    PROCEDURE get_dashboard_stats(
        p_total_users OUT NUMBER, p_active_users OUT NUMBER,
        p_active_courses OUT NUMBER, p_phishing_campaigns OUT NUMBER,
        p_completed_enrollments OUT NUMBER, p_pab_reports OUT NUMBER);
    PROCEDURE get_top_risk_users(p_limit IN NUMBER DEFAULT 10, p_cursor OUT SYS_REFCURSOR);
END pkg_analytics;
/

CREATE OR REPLACE PACKAGE BODY pkg_analytics AS
    PROCEDURE refresh_all_views IS
    BEGIN
        DBMS_MVIEW.REFRESH('MV_OU_RISK','C');
        DBMS_MVIEW.REFRESH('MV_ORG_RISK','C');
        DBMS_MVIEW.REFRESH('MV_CAMPAIGN_STATS','C');
        DBMS_MVIEW.REFRESH('MV_TRAINING_PROGRESS','C');
    END refresh_all_views;

    PROCEDURE get_dashboard_stats(
        p_total_users OUT NUMBER, p_active_users OUT NUMBER,
        p_active_courses OUT NUMBER, p_phishing_campaigns OUT NUMBER,
        p_completed_enrollments OUT NUMBER, p_pab_reports OUT NUMBER) IS
    BEGIN
        SELECT COUNT(*) INTO p_total_users FROM users;
        SELECT COUNT(*) INTO p_active_users FROM users WHERE status='active';
        SELECT COUNT(*) INTO p_active_courses FROM courses WHERE is_active=1 AND deleted_at IS NULL;
        SELECT COUNT(*) INTO p_phishing_campaigns FROM phishing_campaigns;
        SELECT COUNT(*) INTO p_completed_enrollments FROM training_enrollments WHERE status='completed';
        SELECT COUNT(*) INTO p_pab_reports FROM pab_reports;
    END get_dashboard_stats;

    PROCEDURE get_top_risk_users(p_limit IN NUMBER DEFAULT 10, p_cursor OUT SYS_REFCURSOR) IS
    BEGIN
        OPEN p_cursor FOR
            SELECT u.id, u.display_name, u.email, u.risk_score, u.phish_prone, ou.name AS org_unit_name
            FROM users u LEFT JOIN org_units ou ON u.org_unit_id=ou.id
            WHERE u.status='active' ORDER BY u.risk_score DESC
            FETCH FIRST p_limit ROWS ONLY;
    END get_top_risk_users;
END pkg_analytics;
/

-- =============================================================================
-- SECCIÓN 9: PACKAGE PKG_AUDIT — Registro de auditoría
-- =============================================================================
CREATE OR REPLACE PACKAGE pkg_audit AS
    PROCEDURE log_action(
        p_actor_id IN VARCHAR2, p_action IN VARCHAR2,
        p_entity_type IN VARCHAR2 DEFAULT NULL, p_entity_id IN VARCHAR2 DEFAULT NULL,
        p_details_json IN CLOB DEFAULT NULL, p_ip IN VARCHAR2 DEFAULT NULL);
END pkg_audit;
/

CREATE OR REPLACE PACKAGE BODY pkg_audit AS
    PROCEDURE log_action(
        p_actor_id IN VARCHAR2, p_action IN VARCHAR2,
        p_entity_type IN VARCHAR2 DEFAULT NULL, p_entity_id IN VARCHAR2 DEFAULT NULL,
        p_details_json IN CLOB DEFAULT NULL, p_ip IN VARCHAR2 DEFAULT NULL) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
    BEGIN
        INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,ip)
        VALUES(p_actor_id,p_action,p_entity_type,p_entity_id,p_details_json,p_ip);
        COMMIT;
    END log_action;
END pkg_audit;
/

-- =============================================================================
-- SECCIÓN 10: PACKAGE PKG_AD_SYNC — Sincronización con Active Directory
-- =============================================================================
CREATE OR REPLACE PACKAGE pkg_ad_sync AS
    PROCEDURE deactivate_missing_users(
        p_active_guids IN SYS.ODCIVARCHAR2LIST, p_deactivated OUT NUMBER);
    PROCEDURE upsert_org_unit(
        p_dn IN VARCHAR2, p_name IN VARCHAR2, p_parent_dn IN VARCHAR2,
        p_org_name IN VARCHAR2, p_ad_guid IN VARCHAR2, p_level_num IN NUMBER,
        p_result_id OUT VARCHAR2);
END pkg_ad_sync;
/

CREATE OR REPLACE PACKAGE BODY pkg_ad_sync AS
    PROCEDURE deactivate_missing_users(
        p_active_guids IN SYS.ODCIVARCHAR2LIST, p_deactivated OUT NUMBER) IS
    BEGIN
        UPDATE users SET status='inactive', deactivated_at=SYSTIMESTAMP
        WHERE ad_object_guid IS NOT NULL AND status='active'
          AND ad_object_guid NOT IN (SELECT COLUMN_VALUE FROM TABLE(p_active_guids));
        p_deactivated := SQL%ROWCOUNT;
        COMMIT;
    END deactivate_missing_users;

    PROCEDURE upsert_org_unit(
        p_dn IN VARCHAR2, p_name IN VARCHAR2, p_parent_dn IN VARCHAR2,
        p_org_name IN VARCHAR2, p_ad_guid IN VARCHAR2, p_level_num IN NUMBER,
        p_result_id OUT VARCHAR2) IS
        v_parent_id VARCHAR2(36); v_org_id VARCHAR2(36); v_existing VARCHAR2(36);
    BEGIN
        IF p_parent_dn IS NOT NULL THEN
            BEGIN SELECT id INTO v_parent_id FROM org_units WHERE dn=p_parent_dn;
            EXCEPTION WHEN NO_DATA_FOUND THEN v_parent_id:=NULL; END;
        END IF;
        BEGIN SELECT id INTO v_org_id FROM organizations WHERE name=p_org_name;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            INSERT INTO organizations(name) VALUES(p_org_name) RETURNING id INTO v_org_id;
        END;
        BEGIN
            SELECT id INTO v_existing FROM org_units WHERE dn=p_dn;
            UPDATE org_units SET name=p_name, parent_id=v_parent_id,
                organization_id=v_org_id, level_num=p_level_num WHERE id=v_existing;
            p_result_id := v_existing;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            INSERT INTO org_units(name,dn,parent_id,organization_id,ad_object_guid,level_num)
            VALUES(p_name,p_dn,v_parent_id,v_org_id,p_ad_guid,p_level_num)
            RETURNING id INTO p_result_id;
        END;
        COMMIT;
    END upsert_org_unit;
END pkg_ad_sync;
/

-- =============================================================================
-- SECCIÓN 11: PROCEDIMIENTO — Crear usuario administrador inicial
-- =============================================================================
CREATE OR REPLACE PROCEDURE sp_ensure_admin_user(
    p_email IN VARCHAR2, p_password_hash IN VARCHAR2
) IS
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM users WHERE email=p_email;
    IF v_count = 0 THEN
        INSERT INTO users(email,display_name,first_name,last_name,status,is_admin,password_hash)
        VALUES(p_email,'Administrador','Admin','Sistema','active',1,p_password_hash);
        COMMIT;
    END IF;
END sp_ensure_admin_user;
/

-- =============================================================================
-- SECCIÓN 12: TABLAS ADICIONALES — Quiz, Grupos, Tests Físicos, Mensajes, Config
-- =============================================================================

-- 17. CUSTOM_GROUPS
CREATE TABLE custom_groups (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    name            VARCHAR2(255)   NOT NULL,
    description     CLOB,
    created_by      VARCHAR2(36),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_custom_groups PRIMARY KEY (id),
    CONSTRAINT uk_custom_groups_name UNIQUE (name),
    CONSTRAINT fk_cg_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE custom_groups IS 'Grupos personalizados para segmentación de campañas';

-- 18. CUSTOM_GROUP_MEMBERS
CREATE TABLE custom_group_members (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    group_id        VARCHAR2(36)    NOT NULL,
    user_id         VARCHAR2(36)    NOT NULL,
    added_at        TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_custom_group_members PRIMARY KEY (id),
    CONSTRAINT uk_cgm UNIQUE (group_id, user_id),
    CONSTRAINT fk_cgm_group FOREIGN KEY (group_id) REFERENCES custom_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_cgm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_cgm_group ON custom_group_members(group_id);
CREATE INDEX idx_cgm_user ON custom_group_members(user_id);

-- 19. COURSE_QUESTIONS
CREATE TABLE course_questions (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    course_id       VARCHAR2(36)    NOT NULL,
    question_text   CLOB            NOT NULL,
    question_type   VARCHAR2(30)    DEFAULT 'multiple_choice' NOT NULL,
    sort_order      NUMBER(5)       DEFAULT 0 NOT NULL,
    is_required     NUMBER(1)       DEFAULT 1 NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_course_questions PRIMARY KEY (id),
    CONSTRAINT fk_cq_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT chk_cq_type CHECK (question_type IN ('multiple_choice','true_false','open_text')),
    CONSTRAINT chk_cq_req CHECK (is_required IN (0, 1))
);
CREATE INDEX idx_cq_course ON course_questions(course_id);

-- 20. COURSE_QUESTION_OPTIONS
CREATE TABLE course_question_options (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    question_id     VARCHAR2(36)    NOT NULL,
    option_text     VARCHAR2(2000)  NOT NULL,
    is_correct      NUMBER(1)       DEFAULT 0 NOT NULL,
    sort_order      NUMBER(5)       DEFAULT 0 NOT NULL,
    CONSTRAINT pk_cqo PRIMARY KEY (id),
    CONSTRAINT fk_cqo_question FOREIGN KEY (question_id) REFERENCES course_questions(id) ON DELETE CASCADE,
    CONSTRAINT chk_cqo_correct CHECK (is_correct IN (0, 1))
);
CREATE INDEX idx_cqo_question ON course_question_options(question_id);

-- 21. USER_QUIZ_ATTEMPTS
CREATE TABLE user_quiz_attempts (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    user_id         VARCHAR2(36)    NOT NULL,
    course_id       VARCHAR2(36)    NOT NULL,
    score           NUMBER(5,2)     NOT NULL,
    passed          NUMBER(1)       DEFAULT 0 NOT NULL,
    answers_json    CLOB,
    attempted_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_user_quiz_attempts PRIMARY KEY (id),
    CONSTRAINT fk_uqa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_uqa_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT chk_uqa_passed CHECK (passed IN (0, 1))
);
CREATE INDEX idx_uqa_user ON user_quiz_attempts(user_id);
CREATE INDEX idx_uqa_course ON user_quiz_attempts(course_id);

-- 22. USER_ACKNOWLEDGMENTS
CREATE TABLE user_acknowledgments (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    user_id         VARCHAR2(36)    NOT NULL,
    course_id       VARCHAR2(36)    NOT NULL,
    ip              VARCHAR2(45),
    acknowledged_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_user_acknowledgments PRIMARY KEY (id),
    CONSTRAINT uk_ua UNIQUE (user_id, course_id),
    CONSTRAINT fk_ua_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ua_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX idx_ua_user ON user_acknowledgments(user_id);

-- 23. PHYSICAL_TESTS — Pruebas USB y QR
CREATE TABLE physical_tests (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    test_type       VARCHAR2(20)    NOT NULL,
    name            VARCHAR2(500)   NOT NULL,
    description     CLOB,
    location        VARCHAR2(500),
    org_unit_scope  VARCHAR2(36),
    status          VARCHAR2(20)    DEFAULT 'active' NOT NULL,
    tracking_code   VARCHAR2(255),
    created_by      VARCHAR2(36),
    start_at        TIMESTAMP WITH TIME ZONE,
    end_at          TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_physical_tests PRIMARY KEY (id),
    CONSTRAINT fk_pts_ou FOREIGN KEY (org_unit_scope) REFERENCES org_units(id),
    CONSTRAINT fk_pts_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_pt_type2 CHECK (test_type IN ('usb','qr')),
    CONSTRAINT chk_pt_status2 CHECK (status IN ('active','completed','cancelled'))
);
CREATE INDEX idx_pt_type ON physical_tests(test_type);
CREATE INDEX idx_pt_status ON physical_tests(status);

-- 24. PHYSICAL_TEST_EVENTS — Eventos de pruebas físicas
CREATE TABLE physical_test_events (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    test_id         VARCHAR2(36)    NOT NULL,
    user_id         VARCHAR2(36),
    event_type      VARCHAR2(30)    NOT NULL,
    ip              VARCHAR2(45),
    user_agent      VARCHAR2(1000),
    location_detail VARCHAR2(500),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_pte PRIMARY KEY (id),
    CONSTRAINT fk_pte_test FOREIGN KEY (test_id) REFERENCES physical_tests(id) ON DELETE CASCADE,
    CONSTRAINT fk_pte_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_pte_event CHECK (event_type IN ('usb_connected','qr_scanned','file_opened','reported'))
);
CREATE INDEX idx_pte_test ON physical_test_events(test_id);
CREATE INDEX idx_pte_user ON physical_test_events(user_id);

-- 25. USER_NOTIFICATIONS — Mensajes y notificaciones
CREATE TABLE user_notifications (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    user_id         VARCHAR2(36),
    target_scope    VARCHAR2(20)    DEFAULT 'all' NOT NULL,
    title           VARCHAR2(500)   NOT NULL,
    body            CLOB,
    category        VARCHAR2(50)    DEFAULT 'info' NOT NULL,
    link_url        VARCHAR2(2048),
    is_read         NUMBER(1)       DEFAULT 0 NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_user_notifications PRIMARY KEY (id),
    CONSTRAINT fk_un_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_un_scope CHECK (target_scope IN ('all','admins','user')),
    CONSTRAINT chk_un_category CHECK (category IN ('info','warning','success','security','training','phishing')),
    CONSTRAINT chk_un_read CHECK (is_read IN (0, 1))
);
CREATE INDEX idx_un_user ON user_notifications(user_id);
CREATE INDEX idx_un_read ON user_notifications(is_read);
CREATE INDEX idx_un_created ON user_notifications(created_at DESC);

-- 26. APP_SETTINGS — Configuración de la aplicación
CREATE TABLE app_settings (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    setting_key     VARCHAR2(255)   NOT NULL,
    setting_value   CLOB,
    category        VARCHAR2(100)   DEFAULT 'general' NOT NULL,
    updated_by      VARCHAR2(36),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_app_settings PRIMARY KEY (id),
    CONSTRAINT uk_app_settings_key UNIQUE (setting_key),
    CONSTRAINT fk_as_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE app_settings IS 'Configuración global de la aplicación (key-value)';

-- Triggers for new tables
CREATE OR REPLACE TRIGGER trg_custom_groups_bi
BEFORE INSERT ON custom_groups FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_custom_groups_bu
BEFORE UPDATE ON custom_groups FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_cgm_bi
BEFORE INSERT ON custom_group_members FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    IF :NEW.added_at IS NULL THEN :NEW.added_at := SYSTIMESTAMP; END IF;
END;
/
CREATE OR REPLACE TRIGGER trg_course_questions_bi
BEFORE INSERT ON course_questions FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_cqo_bi
BEFORE INSERT ON course_question_options FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
END;
/
CREATE OR REPLACE TRIGGER trg_uqa_bi
BEFORE INSERT ON user_quiz_attempts FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.attempted_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_ua_bi
BEFORE INSERT ON user_acknowledgments FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.acknowledged_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_physical_tests_bi
BEFORE INSERT ON physical_tests FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_physical_tests_bu
BEFORE UPDATE ON physical_tests FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_pte_bi
BEFORE INSERT ON physical_test_events FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_un_bi
BEFORE INSERT ON user_notifications FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_app_settings_bi
BEFORE INSERT ON app_settings FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_app_settings_bu
BEFORE UPDATE ON app_settings FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/

-- Seed default app_settings
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('program_owner_name', 'Pilar de Ciberseguridad', 'account');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('program_owner_email', 'ciberseguridad@agroamerica.com', 'account');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('program_owner_phone', '+502 XXXX-XXXX', 'account');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('program_owner_location', 'Guatemala', 'account');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('org_name', 'AgroAmérica', 'organization');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('org_industry', 'Agroindustria', 'organization');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('org_employees', '5000+', 'organization');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('org_country', 'Guatemala', 'organization');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('branding_logo_url', '', 'branding');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('branding_primary_color', '#001B71', 'branding');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('branding_secondary_color', '#2B5597', 'branding');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('branding_accent_color', '#00BC70', 'branding');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('branding_font_title', 'Libre Baskerville', 'branding');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('branding_email_footer', 'AgroAmérica — Todos los derechos reservados', 'branding');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('smtp_host', '', 'integrations');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('smtp_port', '587', 'integrations');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('smtp_from', 'noreply@agroamerica.com', 'integrations');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('ad_domain', 'CORPORATIVOAGROAMERICA.CORP', 'integrations');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('ad_base_dn', 'DC=CORPORATIVOAGROAMERICA,DC=CORP', 'integrations');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('cf_team_domain', 'agroamerica', 'integrations');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('phishing_landing_url', '/educacion', 'phishing');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('phishing_tracking_domain', '', 'phishing');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('phishing_throttle_per_min', '50', 'phishing');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('training_pass_score', '70', 'training');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('training_reminder_days', '7', 'training');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('training_allow_retake', '1', 'training');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('reports_schedule', 'weekly', 'reports');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('reports_recipients', 'ciberseguridad@agroamerica.com', 'reports');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('privacy_anonymize_reports', '0', 'privacy');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('privacy_data_retention_days', '730', 'privacy');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('license_plan', 'enterprise', 'licensing');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('license_max_users', '5000', 'licensing');
INSERT INTO app_settings (setting_key, setting_value, category) VALUES ('license_modules', 'phishing,training,pab,reports,asap,physical_tests', 'licensing');
COMMIT;

-- =============================================================================
-- VERIFICACIÓN FINAL
-- =============================================================================
DECLARE
    v_tables NUMBER; v_triggers NUMBER; v_mv NUMBER; v_pkg NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_tables FROM user_tables;
    SELECT COUNT(*) INTO v_triggers FROM user_triggers;
    SELECT COUNT(*) INTO v_mv FROM user_mviews;
    SELECT COUNT(*) INTO v_pkg FROM user_objects WHERE object_type='PACKAGE';
    DBMS_OUTPUT.PUT_LINE('=== eLearning AgroAmérica — Instalación completa ===');
    DBMS_OUTPUT.PUT_LINE('Tablas: ' || v_tables);
    DBMS_OUTPUT.PUT_LINE('Triggers: ' || v_triggers);
    DBMS_OUTPUT.PUT_LINE('Vistas Materializadas: ' || v_mv);
    DBMS_OUTPUT.PUT_LINE('Packages: ' || v_pkg);
    DBMS_OUTPUT.PUT_LINE('================================================');
END;
/
