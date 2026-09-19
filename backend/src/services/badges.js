import { query } from '../db.js';

// Guatemala no tiene horario de verano (UTC-6 fijo).
const TZ = 'America/Guatemala';

// Catálogo de insignias integradas. `icon` es una clave que el frontend
// traduce a un ícono SVG; `criteria.hint` es el texto "cómo obtenerla" que se
// muestra mientras la insignia aún no se ha ganado.
export const BADGE_CATALOG = [
  {
    name: 'Recluta nuevo', icon: 'recruit',
    description: '¡Listo para el servicio de héroe cibernético! Bienvenido, héroe. Ha ganado la insignia de Recluta nuevo.',
    criteria: { type: 'first_login', hint: 'Ingrese a la plataforma por primera vez.' },
  },
  {
    name: 'Héroe cibernético', icon: 'hero',
    description: '¡Excelente! Ha completado su primera capacitación y ha ganado la insignia de Héroe cibernético.',
    criteria: { type: 'courses_completed', min: 1, hint: 'Complete su primera capacitación.' },
  },
  {
    name: 'Primer intento', icon: 'target',
    description: 'Aprobó un examen a la primera. ¡Puntería de héroe! Ha ganado la insignia de Primer intento.',
    criteria: { type: 'first_attempt_pass', hint: 'Apruebe el examen de una capacitación en su primer intento.' },
  },
  {
    name: 'Graduado', icon: 'graduate',
    description: 'Otro trofeo para agregar a la vitrina del héroe. Por descargar su diploma ganó la insignia de Graduado.',
    criteria: { type: 'diploma_downloaded', hint: 'Descargue el diploma de una capacitación completada.' },
  },
  {
    name: 'Triplete', icon: 'triple',
    description: 'Bien, tres capacitaciones realizadas en 24 horas. Su heroico compromiso lo ha hecho ganar la insignia de Triplete.',
    criteria: { type: 'courses_in_window', count: 3, hours: 24, hint: 'Complete tres capacitaciones en un lapso de 24 horas.' },
  },
  {
    name: 'Madrugador', icon: 'sunrise',
    description: '¡Un héroe se levanta en la madrugada! Ha ganado la insignia de Madrugador por completar una capacitación temprano en la mañana.',
    criteria: { type: 'completed_hour_range', from: 5, to: 8, hint: 'Complete una capacitación entre las 5:00 y las 7:59 a.m.' },
  },
  {
    name: 'Noctámbulo', icon: 'owl',
    description: '¡Un héroe nunca duerme! Ha ganado la insignia de Noctámbulo por completar una capacitación después del horario laboral.',
    criteria: { type: 'completed_hour_range', from: 19, to: 5, hint: 'Complete una capacitación entre las 7:00 p.m. y las 4:59 a.m.' },
  },
  {
    name: 'Vigilante', icon: 'flag',
    description: 'Reportó su primer correo sospechoso con el Phish Alert Button. Ha ganado la insignia de Vigilante.',
    criteria: { type: 'pab_count', min: 1, hint: 'Reporte un correo sospechoso con el Phish Alert Button.' },
  },
  {
    name: 'Caza-anzuelos', icon: 'hook',
    description: 'Detectó un phishing simulado y lo reportó antes de caer. Ha ganado la insignia de Caza-anzuelos.',
    criteria: { type: 'reported_simulated', hint: 'Reporte un correo de phishing simulado con el Phish Alert Button.' },
  },
  {
    name: 'Imperturbable', icon: 'shield',
    description: 'Recibió varias pruebas de phishing y no cayó en ninguna. Ha ganado la insignia de Imperturbable.',
    criteria: { type: 'no_clicks_min_campaigns', min: 3, hint: 'Reciba al menos tres campañas de phishing simulado sin dar clic en ninguna.' },
  },
  {
    name: 'Imparable', icon: 'rocket',
    description: 'Cinco capacitaciones completadas. ¡Nada detiene a este héroe! Ha ganado la insignia de Imparable.',
    criteria: { type: 'courses_completed', min: 5, hint: 'Complete cinco capacitaciones.' },
  },
  {
    name: 'Misión cumplida', icon: 'medal',
    description: 'Completó todas las capacitaciones que tenía asignadas. Ha ganado la insignia de Misión cumplida.',
    criteria: { type: 'all_courses_completed', hint: 'Complete todas las capacitaciones que tiene asignadas.' },
  },
];

/** Inserta en `badges` las insignias del catálogo que aún no existan (por nombre). */
export async function ensureBadgeCatalog() {
  const { rows } = await query('SELECT name FROM badges');
  const existing = new Set(rows.map(r => String(r.name).toLowerCase()));
  let created = 0;
  for (const b of BADGE_CATALOG) {
    if (existing.has(b.name.toLowerCase())) continue;
    await query(
      'INSERT INTO badges (name, description, icon_url, criteria_json) VALUES (:1, :2, :3, :4)',
      [b.name, b.description, b.icon, JSON.stringify(b.criteria)]
    );
    created++;
  }
  return created;
}

function localHour(date) {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(date),
    10
  );
}

function inHourRange(hour, from, to) {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Evalúa un criterio contra los datos reales del usuario. Devuelve { earned, at } (at = fecha real del logro, si se conoce). */
async function checkCriteria(userId, criteria, ctx) {
  switch (criteria.type) {
    case 'first_login': {
      const { rows } = await query('SELECT last_login_at FROM users WHERE id = :1', [userId]);
      return { earned: !!rows[0]?.last_login_at };
    }
    case 'courses_completed': {
      const done = await ctx.completions();
      const min = criteria.min || 1;
      return done.length >= min ? { earned: true, at: done[min - 1] } : { earned: false };
    }
    case 'first_attempt_pass': {
      const { rows } = await query(
        `SELECT MIN(a.attempted_at) AS first_at FROM user_quiz_attempts a
         WHERE a.user_id = :1 AND a.passed = 1
           AND a.attempted_at = (SELECT MIN(x.attempted_at) FROM user_quiz_attempts x
                                 WHERE x.user_id = a.user_id AND x.course_id = a.course_id)`,
        [userId]
      );
      return rows[0]?.first_at ? { earned: true, at: rows[0].first_at } : { earned: false };
    }
    case 'courses_in_window': {
      const done = await ctx.completions();
      const n = criteria.count || 3;
      const windowMs = (criteria.hours || 24) * 3600 * 1000;
      for (let i = 0; i + n - 1 < done.length; i++) {
        if (new Date(done[i + n - 1]) - new Date(done[i]) < windowMs) return { earned: true, at: done[i + n - 1] };
      }
      return { earned: false };
    }
    case 'completed_hour_range': {
      const done = await ctx.completions();
      const hit = done.find(d => inHourRange(localHour(new Date(d)), criteria.from, criteria.to));
      return hit ? { earned: true, at: hit } : { earned: false };
    }
    case 'pab_count': {
      const { rows } = await query('SELECT created_at FROM pab_reports WHERE user_id = :1 ORDER BY created_at', [userId]);
      const min = criteria.min || 1;
      return rows.length >= min ? { earned: true, at: rows[min - 1].created_at } : { earned: false };
    }
    case 'reported_simulated': {
      const { rows } = await query('SELECT MIN(created_at) AS first_at FROM pab_reports WHERE user_id = :1 AND was_simulated = 1', [userId]);
      return rows[0]?.first_at ? { earned: true, at: rows[0].first_at } : { earned: false };
    }
    case 'no_clicks_min_campaigns': {
      const { rows } = await query(
        `SELECT
           (SELECT COUNT(DISTINCT campaign_id) FROM phishing_results WHERE user_id = :1 AND event = 'delivered') AS delivered,
           (SELECT COUNT(*) FROM phishing_results WHERE user_id = :2 AND event = 'clicked') AS clicked
         FROM DUAL`,
        [userId, userId]
      );
      return { earned: parseInt(rows[0]?.delivered || 0, 10) >= (criteria.min || 3) && parseInt(rows[0]?.clicked || 0, 10) === 0 };
    }
    case 'zero_clicks': {
      const { rows } = await query("SELECT COUNT(*) AS cnt FROM phishing_results WHERE user_id = :1 AND event = 'clicked'", [userId]);
      return { earned: parseInt(rows[0]?.cnt || 0, 10) === 0 };
    }
    case 'all_courses_completed': {
      const { rows } = await query(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
         FROM training_enrollments WHERE user_id = :1`,
        [userId]
      );
      const total = parseInt(rows[0]?.total || 0, 10);
      return { earned: total > 0 && total === parseInt(rows[0]?.done || 0, 10) };
    }
    case 'learning_path': {
      if (!criteria.path_id) return { earned: false };
      const { rows: inPath } = await query('SELECT course_id FROM learning_path_courses WHERE path_id = :1', [criteria.path_id]);
      if (inPath.length === 0) return { earned: false };
      const { rows: done } = await query(
        `SELECT COUNT(*) AS cnt FROM training_enrollments
         WHERE user_id = :1 AND status = 'completed'
           AND course_id IN (SELECT course_id FROM learning_path_courses WHERE path_id = :2)`,
        [userId, criteria.path_id]
      );
      return { earned: parseInt(done[0]?.cnt || 0, 10) >= inPath.length };
    }
    default:
      // Tipos basados en eventos (ej. diploma_downloaded) se otorgan con awardBadgesByType.
      return { earned: false };
  }
}

function makeContext(userId) {
  let completionsCache = null;
  return {
    async completions() {
      if (!completionsCache) {
        const { rows } = await query(
          `SELECT MIN(completed_at) AS completed_at FROM training_enrollments
           WHERE user_id = :1 AND status = 'completed' AND completed_at IS NOT NULL
           GROUP BY course_id ORDER BY 1`,
          [userId]
        );
        completionsCache = rows.map(r => r.completed_at);
      }
      return completionsCache;
    },
  };
}

async function pendingBadges(userId) {
  const { rows } = await query(
    `SELECT b.id, b.name, b.description, b.icon_url, b.criteria_json
     FROM badges b
     WHERE NOT EXISTS (SELECT 1 FROM user_badges ub WHERE ub.badge_id = b.id AND ub.user_id = :1)`,
    [userId]
  );
  return rows.map(r => {
    let criteria = {};
    try { criteria = JSON.parse(r.criteria_json || '{}'); } catch { /* criterio inválido: nunca se otorga */ }
    return { ...r, criteria };
  });
}

async function grant(userId, badge, at) {
  try {
    await query('INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES (:1, :2, :3)', [userId, badge.id, at || null]);
    return { id: badge.id, name: badge.name, description: badge.description, icon_url: badge.icon_url };
  } catch {
    return null; // duplicado (ya la tenía)
  }
}

/** Revisa todas las insignias pendientes del usuario y otorga las que cumplan. Devuelve las nuevas. */
export async function evaluateBadges(userId) {
  const awarded = [];
  const ctx = makeContext(userId);
  for (const badge of await pendingBadges(userId)) {
    if (!badge.criteria.type) continue;
    const result = await checkCriteria(userId, badge.criteria, ctx);
    if (result.earned) {
      const g = await grant(userId, badge, result.at);
      if (g) awarded.push(g);
    }
  }
  return awarded;
}

/** Otorga las insignias cuyo criterio sea de un tipo basado en evento (ej. 'diploma_downloaded'). */
export async function awardBadgesByType(userId, type) {
  const awarded = [];
  for (const badge of await pendingBadges(userId)) {
    if (badge.criteria.type !== type) continue;
    const g = await grant(userId, badge, null);
    if (g) awarded.push(g);
  }
  return awarded;
}

/** Igual que evaluateBadges pero nunca lanza: los logros no deben romper el flujo principal. */
export async function evaluateBadgesSafe(userId) {
  try { return await evaluateBadges(userId); } catch (err) {
    console.error('[BADGES] Error evaluando insignias:', err.message);
    return [];
  }
}
