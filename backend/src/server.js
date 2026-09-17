import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import cron from 'node-cron';
import { checkDbHealth, ensureAdminUser } from './health.js';
import { query, initPool } from './db.js';
import { syncAD } from './services/ad-sync.js';
import { refreshMaterializedViews } from './services/risk-engine.js';
import { notifyUpcomingDue, notifyManagersOverdue, notifyOverdueUsers, launchTrainingCampaign } from './services/notifications.js';
import { authenticateToken, requireAdmin } from './middleware/auth.js';
import { validate } from './middleware/validate.js';
import { loginSchema } from './schemas/auth.js';
import adminRoutes from './routes/admin.js';
import contentRoutes from './routes/content.js';
import analyticsRoutes from './routes/analytics.js';
import phishingRoutes from './routes/phishing.js';
import libraryRoutes from './routes/library.js';
import settingsRoutes from './routes/settings.js';
import auditLogRoutes from './routes/audit-log.js';
import groupsRoutes from './routes/groups.js';
import quizRoutes from './routes/quiz.js';
import notificationsRoutes from './routes/notifications.js';
import physicalTestsRoutes from './routes/physical-tests.js';
import appSettingsRoutes from './routes/app-settings.js';
import rolesRoutes from './routes/roles.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3005', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';

// La app corre detrás de nginx + Cloudflare, que añaden X-Forwarded-For.
// Sin esto, express-rate-limit lanza ERR_ERL_UNEXPECTED_X_FORWARDED_FOR y no
// identifica bien la IP del cliente (rate limiting por IP incorrecto).
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('short'));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Excluir endpoints de tracking de phishing (alto volumen por diseño)
    return req.path.startsWith('/api/phish/');
  },
  message: { error: 'Demasiadas solicitudes. Intente de nuevo más tarde.' },
});
app.use('/api/', limiter);

// Rate limiter específico para endpoints de tracking (más permisivo)
const phishTrackLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: '',
});
app.use('/api/phish/', phishTrackLimiter);

// Rate limiter estricto para login (prevención de brute force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Intente de nuevo en 15 minutos.' },
});
app.use('/api/auth/login', loginLimiter);

app.get('/api/health', async (_req, res) => {
  const dbOk = await checkDbHealth();
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'elearning-agroamerica-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'error',
  });
});

app.post('/api/auth/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      'SELECT id, email, display_name, is_admin, risk_score, password_hash FROM users WHERE LOWER(email) = :1 AND status = :2',
      [email.toLowerCase(), 'active']
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const passHash = user.PASSWORD_HASH || user.password_hash;
    if (!passHash) {
      return res.status(401).json({ error: 'Este usuario no tiene contraseña configurada (use Cloudflare Access)' });
    }

    const valid = await bcrypt.compare(password, passHash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const userId = user.ID || user.id;
    const userEmail = user.EMAIL || user.email;
    const displayName = user.DISPLAY_NAME || user.display_name;
    const isAdmin = (user.IS_ADMIN || user.is_admin) === 1;

    const token = jwt.sign(
      { id: userId, email: userEmail, displayName, isAdmin },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    await query(
      "INSERT INTO audit_log (actor_id, action, ip) VALUES (:1, 'login', :2)",
      [userId, req.ip]
    );

    res.json({
      token,
      user: { id: userId, email: userEmail, displayName, isAdmin, riskScore: user.RISK_SCORE || user.risk_score },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    // req.user ya fue poblado por el middleware (Cloudflare o Bearer token)
    const { rows } = await query(
      'SELECT id, email, display_name, is_admin, risk_score, phish_prone FROM users WHERE id = :1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = rows[0];
    res.json({
      user: {
        id: user.ID || user.id,
        email: user.EMAIL || user.email,
        display_name: user.DISPLAY_NAME || user.display_name,
        is_admin: user.IS_ADMIN || user.is_admin,
        risk_score: user.RISK_SCORE || user.risk_score,
        phish_prone: user.PHISH_PRONE || user.phish_prone,
      }
    });
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT
        (SELECT count(*) FROM users) AS total_users,
        (SELECT count(*) FROM users WHERE status = 'active') AS active_users,
        (SELECT count(*) FROM courses WHERE is_active = 1 AND deleted_at IS NULL) AS active_courses,
        (SELECT count(*) FROM phishing_campaigns) AS total_phishing_campaigns,
        (SELECT count(*) FROM training_enrollments WHERE status = 'completed') AS completed_enrollments,
        (SELECT count(*) FROM pab_reports) AS total_pab_reports
       FROM DUAL`
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', contentRoutes);
app.use('/api', phishingRoutes);
app.use('/api', libraryRoutes);
app.use('/api', quizRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', physicalTestsRoutes);
app.use('/api/admin', settingsRoutes);
app.use('/api/admin', auditLogRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', analyticsRoutes);
app.use('/api/admin', groupsRoutes);
app.use('/api/admin', appSettingsRoutes);
app.use('/api/admin', rolesRoutes);

// ============ Training Campaign Launch ============
app.post('/api/admin/training-campaigns', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, path_id, org_unit_scope, due_at, targets } = req.body;
    if (!name || !path_id) return res.status(400).json({ error: 'name y path_id son requeridos' });

    // Encode targets into description field with a special marker (avoids schema changes)
    const hasTargets = targets && (targets.user_ids?.length || targets.ou_ids?.length || targets.group_ids?.length);
    const descWithTargets = hasTargets
      ? `${description || ''}\n##TARGETS##${JSON.stringify(targets)}`
      : (description || '');

    // Use first OU as primary scope for display
    const primaryOU = targets?.ou_ids?.[0] || org_unit_scope || null;

    await query(
      `INSERT INTO training_campaigns (name, description, path_id, org_unit_scope, due_at, is_ongoing, created_by)
       VALUES (:1, :2, :3, :4, TO_TIMESTAMP_TZ(:5, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'), 0, :6)`,
      [name, descWithTargets, path_id, primaryOU, due_at || null, req.user.id]
    );

    const { rows } = await query(
      `SELECT id FROM training_campaigns WHERE name = :1 AND created_by = :2 ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
      [name, req.user.id]
    );
    const campaignId = rows[0]?.id;

    console.log(`[CAMPAIGN] Created "${name}" id=${campaignId} hasTargets=${hasTargets} primaryOU=${primaryOU}`);
    res.json({ success: true, campaign: { id: campaignId, name } });
  } catch (err) {
    console.error('[CAMPAIGN-CREATE] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/training-campaigns/:id/launch', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { targets } = req.body || {};
    const result = await launchTrainingCampaign(req.params.id, targets);
    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details_json)
       VALUES (:1, 'training_campaign_launch', 'training_campaign', :2, :3)`,
      [req.user.id, req.params.id, JSON.stringify(result)]
    );
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/training-campaigns', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT tc.id, tc.name, tc.description, tc.org_unit_scope, tc.path_id, tc.due_at,
              tc.is_ongoing, tc.created_at,
              lp.name AS path_name,
              ou.name AS org_unit_name,
              (SELECT COUNT(*) FROM training_enrollments te WHERE te.campaign_id = tc.id) AS enrollment_count,
              (SELECT COUNT(*) FROM training_enrollments te WHERE te.campaign_id = tc.id AND te.status = 'completed') AS completed_count
       FROM training_campaigns tc
       LEFT JOIN learning_paths lp ON tc.path_id = lp.id
       LEFT JOIN org_units ou ON tc.org_unit_scope = ou.id
       ORDER BY tc.created_at DESC`
    );

    // Parse targets from description and add a targets_summary field
    const marker = '##TARGETS##';
    const enriched = rows.map(r => {
      const desc = r.description || '';
      const markerIdx = desc.indexOf(marker);
      let targets = null;
      let cleanDesc = desc;
      if (markerIdx !== -1) {
        try { targets = JSON.parse(desc.substring(markerIdx + marker.length)); } catch { }
        cleanDesc = desc.substring(0, markerIdx).trim();
      }

      let targetSummary = r.org_unit_name || 'Toda la organización';
      if (targets) {
        const parts = [];
        if (targets.user_ids?.length) parts.push(`${targets.user_ids.length} usuarios`);
        if (targets.ou_ids?.length) parts.push(`${targets.ou_ids.length} OUs`);
        if (targets.group_ids?.length) parts.push(`${targets.group_ids.length} grupos`);
        if (parts.length > 0) targetSummary = parts.join(', ');
      }

      return { ...r, description: cleanDesc, target_summary: targetSummary };
    });

    res.json({ data: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar training campaign
app.put('/api/admin/training-campaigns/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, path_id, org_unit_scope, due_at } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;

    if (name) { sets.push(`name = :${idx++}`); params.push(name); }
    if (description !== undefined) { sets.push(`description = :${idx++}`); params.push(description); }
    if (path_id) { sets.push(`path_id = :${idx++}`); params.push(path_id); }
    if (org_unit_scope !== undefined) { sets.push(`org_unit_scope = :${idx++}`); params.push(org_unit_scope || null); }
    if (due_at !== undefined) { sets.push(`due_at = TO_TIMESTAMP_TZ(:${idx++}, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')`); params.push(due_at || null); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    await query(`UPDATE training_campaigns SET ${sets.join(', ')} WHERE id = :${idx}`, [...params, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Eliminar training campaign
app.delete('/api/admin/training-campaigns/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM training_enrollments WHERE campaign_id = :1', [req.params.id]);
    const { rowsAffected } = await query('DELETE FROM training_campaigns WHERE id = :1', [req.params.id]);
    if (rowsAffected === 0) return res.status(404).json({ error: 'Campaña no encontrada' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ Notificaciones (manual trigger por admin) ============
app.post('/api/admin/notifications/upcoming', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const result = await notifyUpcomingDue();
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/notifications/overdue', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const result = await notifyManagersOverdue();
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/notifications/overdue-users', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const result = await notifyOverdueUsers();
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ CRON JOBS ============

// Cada hora: AD sync + refresh vistas
cron.schedule('0 * * * *', async () => {
  console.log('[CRON] Running scheduled AD sync...');
  try {
    const stats = await syncAD();
    console.log('[CRON] AD sync complete:', JSON.stringify(stats));
    await refreshMaterializedViews();
    console.log('[CRON] Materialized views refreshed');
  } catch (err) {
    console.error('[CRON] AD sync failed:', err.message);
  }
});

// Cada día a las 7am: notificar capacitaciones por vencer
cron.schedule('0 7 * * *', async () => {
  console.log('[CRON] Checking upcoming training due dates...');
  try {
    const result = await notifyUpcomingDue();
    console.log('[CRON] Upcoming notifications:', JSON.stringify(result));
  } catch (err) {
    console.error('[CRON] Notification error:', err.message);
  }
});

// Cada lunes a las 8am: notificar a jefes sobre capacitaciones vencidas
cron.schedule('0 8 * * 1', async () => {
  console.log('[CRON] Notifying managers about overdue training...');
  try {
    const result = await notifyManagersOverdue();
    console.log('[CRON] Manager notifications:', JSON.stringify(result));
  } catch (err) {
    console.error('[CRON] Manager notification error:', err.message);
  }
});

async function start() {
  // Inicializar pool de conexiones Oracle
  await initPool();

  let attempts = 0;
  const maxAttempts = 30;
  while (attempts < maxAttempts) {
    const ok = await checkDbHealth();
    if (ok) break;
    attempts++;
    console.log(`Waiting for DB... (attempt ${attempts}/${maxAttempts})`);
    await new Promise(r => setTimeout(r, 2000));
  }

  if (attempts >= maxAttempts) {
    console.error('Could not connect to database after max retries');
  }

  await ensureAdminUser();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`eLearning AgroAmérica API running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

start();

export default app;
