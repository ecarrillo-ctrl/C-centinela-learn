-- =============================================================================
-- Migration 004: Modulo de Usuarios ampliado
-- Ultimo login, roles/permisos granulares, tabla base para "Funciones de seguridad"
-- Ejecutar: sqlplus ELEARNING/"password"@host:1521/ORCL @migration_004_users_module.sql
-- =============================================================================
WHENEVER SQLERROR CONTINUE;

-- Ultimo inicio de sesion (se actualiza en cada autenticacion via Cloudflare Access)
ALTER TABLE users ADD (last_login_at TIMESTAMP WITH TIME ZONE);
CREATE INDEX idx_users_last_login ON users(last_login_at);

-- 28. ROLES — roles personalizados con permisos granulares (Funciones de seguridad)
CREATE TABLE roles (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    name            VARCHAR2(255)   NOT NULL,
    description     CLOB,
    permissions_json CLOB           DEFAULT '[]',
    created_by      VARCHAR2(36),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_roles PRIMARY KEY (id),
    CONSTRAINT uk_roles_name UNIQUE (name),
    CONSTRAINT fk_roles_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE roles IS 'Roles personalizados con permisos granulares por modulo';

-- 29. USER_ROLES — asignacion de roles a usuarios
CREATE TABLE user_roles (
    id              VARCHAR2(36)    DEFAULT SYS_GUID() NOT NULL,
    user_id         VARCHAR2(36)    NOT NULL,
    role_id         VARCHAR2(36)    NOT NULL,
    assigned_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_user_roles PRIMARY KEY (id),
    CONSTRAINT uk_user_roles UNIQUE (user_id, role_id),
    CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
CREATE INDEX idx_ur_user ON user_roles(user_id);
CREATE INDEX idx_ur_role ON user_roles(role_id);

CREATE OR REPLACE TRIGGER trg_roles_bi
BEFORE INSERT ON roles FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.created_at := SYSTIMESTAMP; :NEW.updated_at := SYSTIMESTAMP;
END;
/
CREATE OR REPLACE TRIGGER trg_roles_bu
BEFORE UPDATE ON roles FOR EACH ROW
BEGIN :NEW.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_user_roles_bi
BEFORE INSERT ON user_roles FOR EACH ROW
BEGIN
    IF :NEW.id IS NULL THEN :NEW.id := fn_new_uuid(); END IF;
    :NEW.assigned_at := SYSTIMESTAMP;
END;
/

COMMIT;
/
