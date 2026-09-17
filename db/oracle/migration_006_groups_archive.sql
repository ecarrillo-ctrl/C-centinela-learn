-- =============================================================================
-- Migration 006: Estado archivado para grupos (OUs y grupos personalizados)
-- Ejecutar: sqlplus ELEARNING/"password"@host:1521/ORCL @migration_006_groups_archive.sql
-- =============================================================================
WHENEVER SQLERROR CONTINUE;

ALTER TABLE custom_groups ADD (is_archived NUMBER(1) DEFAULT 0 NOT NULL);
ALTER TABLE custom_groups ADD CONSTRAINT chk_cg_archived CHECK (is_archived IN (0, 1));
CREATE INDEX idx_cg_archived ON custom_groups(is_archived);

-- "Archivar" un OU es una bandera local (no toca Active Directory ni el
-- proceso de sync); solo lo oculta de las vistas activas dentro de la app.
ALTER TABLE org_units ADD (is_archived NUMBER(1) DEFAULT 0 NOT NULL);
ALTER TABLE org_units ADD CONSTRAINT chk_ou_archived CHECK (is_archived IN (0, 1));
CREATE INDEX idx_ou_archived ON org_units(is_archived);

COMMIT;
/
