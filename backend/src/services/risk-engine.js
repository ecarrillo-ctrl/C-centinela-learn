import { query, execute } from '../db.js';
import RULES from '../config/risk-rules.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeDelta(eventType, referenceId = null) {
  const rule = RULES[eventType];
  if (!rule) {
    throw new Error(`Regla de riesgo desconocida: ${eventType}`);
  }
  return {
    delta: rule.delta,
    reason: rule.reason,
    source: eventType, // Pass the full event type key — applyRiskEvent maps it to the enum
  };
}

export async function applyRiskEvent(userId, delta, reason, source, referenceId = null) {
  const sqlSource = mapSourceToEnum(source);

  await query(
    `INSERT INTO risk_score_events (user_id, delta, reason, source, reference_id)
     VALUES (:1, :2, :3, :4, :5)`,
    [userId, delta, reason, sqlSource, referenceId]
  );

  await recalculateUserScore(userId);

  const { rows } = await query('SELECT risk_score FROM users WHERE id = :1', [userId]);
  const rawScore = rows[0]?.RISK_SCORE ?? rows[0]?.risk_score ?? 0;
  return parseFloat(rawScore);
}

export async function recalculateUserScore(userId) {
  const halfLifeDays = RULES.decay_half_life_days;

  const { rows } = await query(
    `SELECT id, delta, created_at FROM risk_score_events
     WHERE user_id = :1
     ORDER BY created_at ASC`,
    [userId]
  );

  let score = RULES.default_risk;

  for (const event of rows) {
    const createdAt = event.CREATED_AT || event.created_at;
    const eventDelta = parseFloat(event.DELTA || event.delta);
    const ageDays = (Date.now() - new Date(createdAt).getTime()) / DAY_MS;
    const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);

    if (eventDelta > 0) {
      score += eventDelta * decayFactor;
    } else {
      score += eventDelta;
    }
  }

  score = Math.max(RULES.score_min, Math.min(RULES.score_max, Math.round(score * 100) / 100));

  await query(
    `UPDATE users SET risk_score = :1 WHERE id = :2`,
    [score, userId]
  );

  return score;
}

export async function markPhishProne(userId, campaignId) {
  const { rows } = await query(
    `SELECT 1 AS found FROM phishing_results
     WHERE user_id = :1 AND campaign_id = :2 AND event = 'clicked'
     FETCH FIRST 1 ROWS ONLY`,
    [userId, campaignId]
  );

  const phishProne = rows.length > 0 ? 1 : 0;

  await query(
    `UPDATE users SET phish_prone = :1 WHERE id = :2`,
    [phishProne, userId]
  );

  return phishProne === 1;
}

export async function refreshMaterializedViews() {
  await execute(
    `BEGIN pkg_analytics.refresh_all_views; END;`,
    {}
  );
}

function mapSourceToEnum(source) {
  switch (source) {
    case 'phishing_clicked':
    case 'phishing_attachment_opened':
    case 'phishing_data_entered':
    case 'phishing_replied':
      return 'phishing';
    case 'pab_report_simulated':
    case 'pab_report_real':
      return 'pab';
    case 'training_completed':
    case 'training_path_completed':
      return 'training';
    default:
      return 'manual';
  }
}
