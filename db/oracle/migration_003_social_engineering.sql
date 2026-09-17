-- =============================================================================
-- Migration 003: Ingeniería Social Pasiva — Páginas corporativas look-alike
-- Ejecutar: sqlplus ELEARNING/"password"@host:1521/ORCL @migration_003_social_engineering.sql
-- =============================================================================
WHENEVER SQLERROR CONTINUE;

-- 27. PHISHING_CORPORATE_PAGES — lista administrable de apps corporativas
-- reales vs. su variante "look-alike" usada en enlaces de campañas pasivas.
CREATE TABLE phishing_corporate_pages (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    name            VARCHAR2(255)   NOT NULL,
    real_url        VARCHAR2(500)   NOT NULL,
    lookalike_url   VARCHAR2(500)   NOT NULL,
    is_active       NUMBER(1)       DEFAULT 1 NOT NULL,
    created_by      VARCHAR2(36),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_phishing_corporate_pages PRIMARY KEY (id),
    CONSTRAINT fk_pcp_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_pcp_active CHECK (is_active IN (0, 1))
);
COMMENT ON TABLE phishing_corporate_pages IS 'Apps corporativas reales y su variante look-alike para campañas de ingeniería social pasiva';
CREATE INDEX idx_pcp_active ON phishing_corporate_pages(is_active);

CREATE OR REPLACE TRIGGER trg_pcp_bi
BEFORE INSERT ON phishing_corporate_pages FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_pcp_bu
BEFORE UPDATE ON phishing_corporate_pages FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/

-- Vincula una campaña a una página corporativa. Si está presente, la campaña
-- se considera "ingeniería social pasiva": el link mostrado en el correo usa
-- lookalike_url y el clic redirige a la pantalla de precaución (no a la
-- landing educativa con banderas rojas del módulo clásico de phishing).
ALTER TABLE phishing_campaigns ADD (corporate_page_id VARCHAR2(36));
ALTER TABLE phishing_campaigns ADD CONSTRAINT fk_pc_corporate_page
  FOREIGN KEY (corporate_page_id) REFERENCES phishing_corporate_pages(id) ON DELETE SET NULL;
CREATE INDEX idx_pc_corporate_page ON phishing_campaigns(corporate_page_id);

-- Nota: el evento 'delivered' ya estaba contemplado en el CHECK constraint de
-- phishing_results (chk_pr_event) pero nunca se insertaba desde el código.
-- A partir de esta migración, phishing-service.js registra 'delivered' por
-- cada destinatario al enviar, lo que permite calcular quién "ignoró" la
-- campaña (recibió el correo pero no dio clic ni reportó).

COMMIT;
/
