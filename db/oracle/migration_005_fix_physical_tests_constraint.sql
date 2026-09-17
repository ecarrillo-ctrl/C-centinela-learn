-- =============================================================================
-- Migration 005: Corrige colision de nombre de constraint + crea tablas
-- faltantes de la Seccion 12 que nunca llegaron a crearse en produccion.
--
-- Causa raiz: elearning_agroamerica_oracle.sql definia fk_pt_creator dos veces
-- (phishing_templates.created_by en la linea 235 y physical_tests.created_by
-- en la linea 933). El script base usa WHENEVER SQLERROR CONTINUE, asi que el
-- ORA-02264 al crear physical_tests se ignoraba silenciosamente, dejando sin
-- crear physical_tests, physical_test_events, user_notifications y
-- app_settings en el ambiente donde esto se detecto.
--
-- Ejecutar: sqlplus ELEARNING/"password"@host:1521/ORCL @migration_005_fix_physical_tests_constraint.sql
-- (Seguro de re-ejecutar: cada CREATE fallara con "ya existe" si la tabla ya
-- fue creada, y WHENEVER SQLERROR CONTINUE permite continuar con el resto.)
-- =============================================================================
WHENEVER SQLERROR CONTINUE;

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

-- Semillas de configuracion por defecto (solo se insertan si la tabla estaba vacia)
INSERT INTO app_settings (setting_key, setting_value, category)
  SELECT 'program_owner_name', 'Pilar de Ciberseguridad', 'account' FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'program_owner_name');
INSERT INTO app_settings (setting_key, setting_value, category)
  SELECT 'org_name', 'AgroAmérica', 'organization' FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'org_name');
INSERT INTO app_settings (setting_key, setting_value, category)
  SELECT 'branding_primary_color', '#001B71', 'branding' FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'branding_primary_color');
INSERT INTO app_settings (setting_key, setting_value, category)
  SELECT 'license_modules', 'phishing,training,pab,reports,asap,physical_tests', 'licensing' FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'license_modules');
-- Nota: la lista completa de settings semilla esta en elearning_agroamerica_oracle.sql
-- (seccion 12); agreguelos manualmente si este ambiente los necesita todos.

COMMIT;
/
