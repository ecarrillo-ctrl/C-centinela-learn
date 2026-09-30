-- =============================================================================
-- Migration 008: Soporta preguntas de quiz de selección múltiple (varias
-- respuestas correctas a la vez), además del tipo existente de una sola
-- respuesta correcta.
-- Ejecutar: sqlplus ELEARNING/"password"@host:1521/ORCL @migration_008_multi_select_questions.sql
-- =============================================================================
WHENEVER SQLERROR CONTINUE;

ALTER TABLE course_questions DROP CONSTRAINT chk_cq_type;
ALTER TABLE course_questions ADD CONSTRAINT chk_cq_type
    CHECK (question_type IN ('multiple_choice','multiple_select','true_false','open_text'));

COMMIT;
/
