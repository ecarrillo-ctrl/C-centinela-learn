/**
 * eLearning AgroAmérica — Script de limpieza de datos de demo/prueba
 *
 * BORRA todos los datos transaccionales (enrollments, phishing results,
 * risk events, PAB reports, quiz attempts, etc.) SIN tocar:
 *   - Usuarios
 *   - Organizaciones / OUs
 *   - Cursos
 *   - Rutas de aprendizaje
 *   - Plantillas de phishing
 *   - Badges (definiciones)
 *   - Grupos personalizados y miembros
 *   - Configuración (app_settings)
 *   - Notificaciones
 *
 * Uso:
 *   docker exec -it elearning-backend node scripts/cleanup-demo-data.js
 *
 * Para CONFIRMAR antes de borrar (dry run):
 *   docker exec -it elearning-backend node scripts/cleanup-demo-data.js --dry-run
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

const DRY_RUN = process.argv.includes('--dry-run');

const connectString = process.env.DB_CONNECT_STRING
  || `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${process.env.DB_HOST || 'localhost'})(PORT=${process.env.DB_PORT || '1521'}))(CONNECT_DATA=(SID=${process.env.DB_SID || 'ORCL'})))`;

// Tablas a limpiar en orden (respetando FKs)
const CLEANUP_TABLES = [
  { table: 'user_quiz_attempts',      label: 'Intentos de quiz' },
  { table: 'user_acknowledgments',    label: 'Confirmaciones de cursos' },
  { table: 'training_enrollments',    label: 'Matrículas de capacitación' },
  { table: 'training_campaigns',      label: 'Campañas de capacitación' },
  { table: 'physical_test_events',    label: 'Eventos de pruebas físicas' },
  { table: 'risk_score_events',       label: 'Eventos de riesgo' },
  { table: 'pab_reports',             label: 'Reportes PAB' },
  { table: 'phishing_results',        label: 'Resultados de phishing' },
  { table: 'phishing_campaigns',      label: 'Campañas de phishing' },
  { table: 'user_badges',             label: 'Insignias ganadas por usuarios' },
  { table: 'audit_log',               label: 'Log de auditoría' },
];

// Después de limpiar, resetear risk_score y phish_prone a 0
const RESET_QUERIES = [
  {
    sql: 'UPDATE users SET risk_score = 0, phish_prone = 0',
    label: 'Reset risk_score y phish_prone de todos los usuarios',
  },
];

// Refresh materialized views
const MV_REFRESH = [
  'MV_OU_RISK', 'MV_ORG_RISK', 'MV_CAMPAIGN_STATS', 'MV_TRAINING_PROGRESS',
];

async function cleanup() {
  console.log('');
  console.log('========================================================');
  console.log(' eLearning AgroAmérica — Limpieza de datos de demo/test');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no se borrará nada)' : 'REAL — SE BORRARÁN LOS DATOS'}`);
  console.log('========================================================');
  console.log('');

  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.DB_USER || 'ELEARNING',
      password: process.env.DB_PASSWORD || 'dev_password_123',
      connectString,
    });

    let totalDeleted = 0;

    // Count and optionally delete
    for (const { table, label } of CLEANUP_TABLES) {
      try {
        const { rows: countRows } = await conn.execute(`SELECT COUNT(*) AS cnt FROM ${table}`);
        const count = parseInt(countRows[0]?.CNT || 0);

        if (count === 0) {
          console.log(`  ✓ ${label.padEnd(40)} — ya vacío`);
          continue;
        }

        if (DRY_RUN) {
          console.log(`  ! ${label.padEnd(40)} — ${count} registros (no borrado — dry run)`);
        } else {
          await conn.execute(`DELETE FROM ${table}`);
          await conn.execute('COMMIT');
          console.log(`  ✓ ${label.padEnd(40)} — ${count} registros eliminados`);
          totalDeleted += count;
        }
      } catch (err) {
        console.error(`  ✗ Error en ${table}: ${err.message}`);
      }
    }

    console.log('');

    // Reset user scores
    for (const { sql, label } of RESET_QUERIES) {
      try {
        if (DRY_RUN) {
          console.log(`  ! ${label} (dry run)`);
        } else {
          const result = await conn.execute(sql);
          await conn.execute('COMMIT');
          console.log(`  ✓ ${label} (${result.rowsAffected} usuarios actualizados)`);
        }
      } catch (err) {
        console.error(`  ✗ Error en reset: ${err.message}`);
      }
    }

    console.log('');

    // Refresh materialized views
    if (!DRY_RUN) {
      for (const mv of MV_REFRESH) {
        try {
          await conn.execute(`BEGIN DBMS_MVIEW.REFRESH('${mv}','C'); END;`);
          console.log(`  ✓ Vista materializada ${mv} refrescada`);
        } catch (err) {
          console.error(`  ✗ Error refrescando ${mv}: ${err.message}`);
        }
      }
    }

    console.log('');
    console.log('========================================================');
    if (DRY_RUN) {
      console.log(' DRY RUN completado. Para borrar realmente, ejecute sin --dry-run');
    } else {
      console.log(` Limpieza completada. ${totalDeleted} registros eliminados.`);
      console.log(' Los usuarios, cursos y rutas de aprendizaje se conservaron.');
    }
    console.log('========================================================');
    console.log('');

  } finally {
    if (conn) await conn.close();
  }
}

cleanup().catch(err => {
  console.error('ERROR FATAL:', err.message);
  process.exit(1);
});
