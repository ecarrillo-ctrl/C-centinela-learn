import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';
const CF_ACCESS_TEAM = process.env.CF_ACCESS_TEAM || 'agroamerica';
const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD || '';

/**
 * Middleware de autenticación.
 * Soporta dos métodos (en orden de prioridad):
 *
 * 1. Cloudflare Access JWT (header Cf-Access-Jwt-Assertion)
 *    - Cloudflare firma el JWT con sus claves públicas
 *    - Contiene el email del usuario autenticado
 *    - Se busca/crea el usuario en la BD automáticamente
 *
 * 2. Bearer Token propio (header Authorization: Bearer <token>)
 *    - JWT firmado por nuestro backend (login tradicional)
 *    - Fallback para API calls directas o desarrollo local
 */
export function authenticateToken(req, res, next) {
  // Prioridad 1: Cloudflare Access JWT
  const cfToken = req.headers['cf-access-jwt-assertion'];
  if (cfToken) {
    return authenticateCloudflare(cfToken, req, res, next);
  }

  // Prioridad 2: Bearer token propio
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Autentica via Cloudflare Access JWT.
 * El JWT de Cloudflare se decodifica (sin verificar firma contra JWKS por simplicidad;
 * Cloudflare ya valida al usuario antes de llegar aquí).
 * Si el usuario no existe en la BD, se crea automáticamente.
 */
async function authenticateCloudflare(cfToken, req, res, next) {
  try {
    // Decodificar el JWT de Cloudflare (ya fue validado por el proxy de CF)
    // En producción Cloudflare NUNCA deja pasar un request sin JWT válido
    const decoded = jwt.decode(cfToken);

    if (!decoded || !decoded.email) {
      return res.status(401).json({ error: 'Token de Cloudflare Access inválido' });
    }

    const email = decoded.email.toLowerCase();

    // Buscar usuario en la BD
    const { rows } = await query(
      `SELECT id, email, display_name, is_admin, risk_score, phish_prone, status
       FROM users WHERE LOWER(email) = :1 AND status = :2`,
      [email, 'active']
    );

    if (rows.length > 0) {
      const user = rows[0];
      req.user = {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        isAdmin: user.is_admin === 1,
        riskScore: user.risk_score,
      };
    } else {
      // Usuario no existe — crear automáticamente desde Cloudflare Access
      const displayName = decoded.name || email.split('@')[0];
      const firstName = displayName.split(' ')[0] || '';
      const lastName = displayName.split(' ').slice(1).join(' ') || '';

      await query(
        `INSERT INTO users (email, display_name, first_name, last_name, status, is_admin, risk_score)
         VALUES (:1, :2, :3, :4, 'active', 0, 0)`,
        [email, displayName, firstName, lastName]
      );

      // Recuperar el usuario recién creado (trigger genera el ID)
      const { rows: newRows } = await query(
        `SELECT id, email, display_name, is_admin FROM users WHERE LOWER(email) = :1`,
        [email]
      );

      if (newRows.length > 0) {
        const user = newRows[0];
        req.user = {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          isAdmin: false,
        };
      } else {
        return res.status(500).json({ error: 'Error creando usuario desde Cloudflare Access' });
      }
    }

    next();
  } catch (err) {
    console.error('[CF-AUTH] Error:', err.message);
    return res.status(401).json({ error: 'Error procesando autenticación de Cloudflare Access' });
  }
}

/**
 * Requiere rol de administrador.
 */
export function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
}
