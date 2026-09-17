-- Migration 002: Add new course types (image, audio, document)
-- Run: docker exec elearning-backend node -e "import('./src/db.js').then(m=>m.initPool().then(()=>m.query(\"ALTER TABLE courses DROP CONSTRAINT chk_courses_type\").then(()=>m.query(\"ALTER TABLE courses ADD CONSTRAINT chk_courses_type CHECK (course_type IN ('scorm','video_embed','video_upload','pdf','presentation','image','audio','document'))\").then(()=>{console.log('OK');process.exit(0)})).catch(e=>{console.log(e.message);process.exit(0)})))"

ALTER TABLE courses DROP CONSTRAINT chk_courses_type;
ALTER TABLE courses ADD CONSTRAINT chk_courses_type CHECK (course_type IN ('scorm','video_embed','video_upload','pdf','presentation','image','audio','document'));
COMMIT;
