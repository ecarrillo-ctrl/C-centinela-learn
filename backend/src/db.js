/**
 * eLearning AgroAmérica — Capa de acceso a Oracle 19c
 *
 * Usa oracledb en modo Thin (sin Oracle Client instalado).
 * Provee una interfaz compatible con la API que usaban los routes (query, getClient).
 * Los parámetros se pasan como :1, :2, :3... (bind by position).
 */

import oracledb from 'oracledb';

// Configurar oracledb
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;  // resultados como objetos {col: val}
oracledb.autoCommit = true;                        // auto-commit por defecto
oracledb.fetchAsString = [oracledb.CLOB];          // CLOB como string automáticamente

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && (!process.env.DB_PASSWORD || !process.env.DB_USER)) {
  console.error('FATAL: DB_USER y DB_PASSWORD son requeridos en producción. Configure el .env');
  process.exit(1);
}

// Connection string — soporta tanto SID como Service Name
// Si DB_CONNECT_STRING está definida, se usa directo.
// Si no, se construye un descriptor TNS para SID (formato de Oracle RDS).
function buildConnectString() {
  if (process.env.DB_CONNECT_STRING) {
    return process.env.DB_CONNECT_STRING;
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '1521';
  const sid = process.env.DB_SID || process.env.DB_SERVICE || 'ORCL';
  const useSid = process.env.DB_USE_SID !== 'false'; // por defecto usa SID

  if (useSid) {
    // Formato descriptor TNS para conexión por SID
    return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SID=${sid})))`;
  } else {
    // Formato Easy Connect para Service Name
    return `${host}:${port}/${sid}`;
  }
}

const connectString = buildConnectString();

let pool = null;

/**
 * Inicializa el pool de conexiones.
 * Se llama una vez al arrancar el servidor.
 */
export async function initPool() {
  try {
    pool = await oracledb.createPool({
      user: process.env.DB_USER || 'ELEARNING',
      password: process.env.DB_PASSWORD || 'dev_password_123',
      connectString,
      poolMin: 4,
      poolMax: 20,
      poolIncrement: 2,
      poolTimeout: 60,
      // Resiliencia: valida (ping) las conexiones inactivas antes de entregarlas.
      // Si la RDS se reinició/hizo failover y dejó conexiones muertas en el pool,
      // se detectan y reemplazan en lugar de quedar "colgadas" (evita NJS-040 perpetuo).
      poolPingInterval: 30,
      // Falla rápido cuando no hay conexiones disponibles (antes: 60s → peticiones
      // acumuladas y healthcheck en timeout). 15s da margen bajo carga sin colgar la UI.
      queueTimeout: 15000,
      enableStatistics: process.env.NODE_ENV === 'development',
    });
    console.log(`Oracle connection pool created: ${connectString}`);
    return pool;
  } catch (err) {
    console.error('Failed to create Oracle pool:', err.message);
    throw err;
  }
}

/**
 * Cierra el pool (para shutdown graceful).
 */
export async function closePool() {
  if (pool) {
    await pool.close(10);
    pool = null;
  }
}

/**
 * Ejecuta una query SQL con bind parameters.
 *
 * Convierte automáticamente la sintaxis de $1, $2... (PostgreSQL) a :1, :2... (Oracle)
 * para facilitar la migración gradual de los routes.
 *
 * @param {string} sql - SQL con placeholders ($1 o :1)
 * @param {Array} params - Parámetros posicionales
 * @param {object} options - Opciones adicionales de oracledb.execute
 * @returns {Promise<{rows: Array, rowsAffected: number, outBinds: object}>}
 */
export async function query(sql, params = [], options = {}) {
  if (!pool) {
    throw new Error('Oracle pool not initialized. Call initPool() first.');
  }

  const start = Date.now();
  let connection;

  try {
    connection = await pool.getConnection();

    // Convertir $1, $2... a :1, :2... si es necesario
    const oracleSql = convertPlaceholders(sql);

    // Convertir booleans a 0/1 para Oracle
    const oracleParams = (params || []).map(p => {
      if (p === true) return 1;
      if (p === false) return 0;
      return p;
    });

    const result = await connection.execute(oracleSql, oracleParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options,
    });

    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.warn(`Slow query (${duration}ms):`, oracleSql.substring(0, 150));
    }

    // Normalizar resultado — convertir keys de UPPERCASE a lowercase
    const normalizedRows = (result.rows || []).map(row => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key.toLowerCase()] = value;
      }
      return normalized;
    });

    return {
      rows: normalizedRows,
      rowsAffected: result.rowsAffected || 0,
      outBinds: result.outBinds || null,
      metaData: result.metaData || [],
    };
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

/**
 * Ejecuta un procedimiento PL/SQL con bind parameters nombrados.
 *
 * @param {string} sql - Bloque PL/SQL o CALL statement
 * @param {object} binds - Bind variables nombradas
 * @param {object} options - Opciones adicionales
 * @returns {Promise<object>}
 */
export async function execute(sql, binds = {}, options = {}) {
  if (!pool) {
    throw new Error('Oracle pool not initialized. Call initPool() first.');
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute(sql, binds, {
      autoCommit: true,
      ...options,
    });
    return result;
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

/**
 * Obtiene una conexión del pool (para transacciones manuales).
 * IMPORTANTE: El caller debe hacer connection.close() cuando termine.
 */
export async function getConnection() {
  if (!pool) {
    throw new Error('Oracle pool not initialized. Call initPool() first.');
  }
  return pool.getConnection();
}

/**
 * Convierte placeholders de estilo PostgreSQL ($1, $2) a estilo Oracle (:1, :2).
 * Si el SQL ya usa :1, :2 (Oracle nativo), no hace nada.
 */
function convertPlaceholders(sql) {
  if (!sql.includes('$')) return sql;
  return sql.replace(/\$(\d+)/g, ':$1');
}

/**
 * Helper: Convierte nombres de columnas de snake_case a camelCase en resultados.
 * Oracle devuelve columnas en UPPERCASE por defecto; esta función las normaliza.
 */
export function normalizeRow(row) {
  if (!row) return null;
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    normalized[camelKey] = value;
  }
  return normalized;
}

/**
 * Helper: Normaliza un array de rows.
 */
export function normalizeRows(rows) {
  return (rows || []).map(normalizeRow);
}

export default { initPool, closePool, query, execute, getConnection, normalizeRow, normalizeRows };
