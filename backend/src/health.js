import { query } from './db.js';

/**
 * Crea el usuario administrador inicial si no existe.
 * Autenticación via Cloudflare Access — no requiere password.
 */
export async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL || 'elantan@agroamerica.com';

  const { rows } = await query(
    'SELECT id, is_admin FROM users WHERE LOWER(email) = :1',
    [email.toLowerCase()]
  );

  if (rows.length === 0) {
    // Crear usuario admin
    await query(
      `INSERT INTO users (email, display_name, first_name, last_name, status, is_admin, risk_score)
       VALUES (:1, :2, :3, :4, 'active', 1, 0)`,
      [email, 'Erick Lantan', 'Erick', 'Lantan']
    );
    console.log(`[ADMIN] Usuario administrador creado: ${email}`);
  } else {
    // Si existe pero no es admin, promover
    const isAdmin = rows[0].IS_ADMIN || rows[0].is_admin;
    if (isAdmin !== 1) {
      await query(
        'UPDATE users SET is_admin = 1 WHERE LOWER(email) = :1',
        [email.toLowerCase()]
      );
      console.log(`[ADMIN] Usuario ${email} promovido a administrador`);
    }
  }
}

/**
 * Verifica la salud de la conexión a Oracle.
 */
export async function checkDbHealth() {
  try {
    const result = await query(
      'SELECT COUNT(*) AS cnt FROM user_tables'
    );
    const tableCount = parseInt(result.rows[0]?.CNT || result.rows[0]?.cnt || 0, 10);
    console.log(`DB health OK — ${tableCount} tables in schema`);
    return true;
  } catch (err) {
    console.error('DB health check failed:', err.message);
    return false;
  }
}
