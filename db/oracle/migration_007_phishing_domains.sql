-- =============================================================================
-- Migration 007: Registro de dominios autorizados para simulaciones de phishing
-- Ejecutar: sqlplus ELEARNING/"password"@host:1521/ORCL @migration_007_phishing_domains.sql
-- =============================================================================
WHENEVER SQLERROR CONTINUE;

CREATE TABLE phishing_domains (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    domain          VARCHAR2(255)   NOT NULL,
    notes           VARCHAR2(1000),
    is_active       NUMBER(1)       DEFAULT 1 NOT NULL,
    created_by      VARCHAR2(36),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_phishing_domains PRIMARY KEY (id),
    CONSTRAINT uk_phishing_domains_domain UNIQUE (domain),
    CONSTRAINT fk_pd_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_pd_active CHECK (is_active IN (0, 1))
);
COMMENT ON TABLE phishing_domains IS 'Registro informativo de dominios autorizados para campañas de phishing simulado';
CREATE INDEX idx_pd_active ON phishing_domains(is_active);

CREATE OR REPLACE TRIGGER trg_pd_bi
BEFORE INSERT ON phishing_domains FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_pd_bu
BEFORE UPDATE ON phishing_domains FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/

COMMIT;
/
