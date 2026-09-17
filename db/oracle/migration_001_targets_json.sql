-- =============================================================================
-- Migration 001: Add targets_json to training_campaigns
-- Ejecutar: sqlplus ELEARNING/"password"@host:1521/ORCL @migration_001_targets_json.sql
-- =============================================================================
WHENEVER SQLERROR CONTINUE;

-- Add targets_json CLOB to store { user_ids, ou_ids, group_ids }
ALTER TABLE training_campaigns ADD (targets_json CLOB);

-- Verify
SELECT column_name, data_type FROM user_tab_columns
WHERE table_name = 'TRAINING_CAMPAIGNS' AND column_name = 'TARGETS_JSON';

COMMIT;
/
