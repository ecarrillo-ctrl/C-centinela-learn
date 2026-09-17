/**
 * eLearning AgroAmérica — Seed de datos demo para Oracle 19c
 * Uso: node scripts/seed-demo.js [--reset]
 */
import oracledb from 'oracledb';
import crypto from 'node:crypto';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

const connectString = process.env.DB_CONNECT_STRING
  || `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${process.env.DB_HOST || 'localhost'})(PORT=${process.env.DB_PORT || '1521'}))(CONNECT_DATA=(SID=${process.env.DB_SID || 'ORCL'})))`;

const RESET = process.argv.includes('--reset');

const COMPANIES = [
  { name: 'Corporativo', country: 'Guatemala', ous: ['TI', 'Administracion', 'Finanzas', 'Recursos Humanos', 'Legal', 'Comunicacion'] },
  { name: 'Agrocaribe', country: 'Guatemala', ous: ['Operaciones', 'Calidad', 'Logistica', 'Mantenimiento'] },
  { name: 'Frutera del Pacifico', country: 'Guatemala', ous: ['Produccion', 'Empaque', 'Control de Calidad'] },
  { name: 'Propasa', country: 'Guatemala', ous: ['Ventas', 'Distribucion', 'Almacen'] },
  { name: 'AgroPalma', country: 'Guatemala', ous: ['Plantacion', 'Extraccion', 'Exportaciones'] },
  { name: 'Interlogic/Aldersa', country: 'Panama', ous: ['Operaciones', 'Logistica Internacional', 'Aduanas'] },
];

const FIRST_NAMES = ['Juan', 'Maria', 'Carlos', 'Ana', 'Pedro', 'Lucia', 'Roberto', 'Elena', 'Daniel', 'Sofia', 'Jose', 'Gabriela', 'Miguel', 'Rosa', 'Francisco', 'Carmen', 'Luis', 'Marta', 'Andres', 'Isabel', 'Fernando', 'Patricia', 'Manuel', 'Silvia', 'Antonio', 'Gloria', 'Jorge', 'Adriana', 'Ricardo', 'Laura'];
const LAST_NAMES = ['Garcia', 'Lopez', 'Martinez', 'Rodriguez', 'Perez', 'Hernandez', 'Sanchez', 'Ramirez', 'Cruz', 'Flores', 'Gonzalez', 'Rivera', 'Morales', 'Ortiz', 'Diaz', 'Castillo', 'Romero', 'Ruiz', 'Torres', 'Vargas', 'Mendoza', 'Reyes', 'Jimenez', 'Herrera', 'Aguilar', 'Medina', 'Castro', 'Fernandez', 'Alvarez', 'Gomez'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uuid() { return crypto.randomUUID(); }

async function seed() {
  console.log('=== eLearning AgroAmérica — Seed Demo (Oracle) ===');
  console.log(`Connect: ${connectString.substring(0, 60)}...`);
  console.log(RESET ? 'Mode: RESET' : 'Mode: APPEND');

  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.DB_USER || 'ELEARNING',
      password: process.env.DB_PASSWORD || 'dev_password_123',
      connectString,
    });

    if (RESET) {
      const tables = [
        'physical_test_events', 'physical_tests', 'user_notifications',
        'user_acknowledgments', 'user_quiz_attempts', 'course_question_options',
        'course_questions', 'custom_group_members', 'custom_groups',
        'user_badges', 'badges', 'risk_score_events', 'pab_reports',
        'phishing_results', 'phishing_campaigns', 'phishing_templates',
        'training_enrollments', 'training_campaigns', 'learning_path_courses',
        'learning_paths', 'courses', 'audit_log', 'users', 'org_units', 'organizations'];
      for (const t of tables) {
        try { await conn.execute(`DELETE FROM ${t}`); } catch { }
      }
      await conn.execute('COMMIT');
      console.log('  All data truncated.');
    }

    // Organizations
    const orgMap = {};
    for (const c of COMPANIES) {
      const id = uuid();
      await conn.execute(
        'INSERT INTO organizations (id, name, country) VALUES (:1, :2, :3)',
        [id, c.name, c.country]
      );
      orgMap[c.name] = id;
      console.log(`  Org: ${c.name}`);
    }

    // OUs
    const ouIds = [];
    const userCounts = [];
    for (const c of COMPANIES) {
      for (const ouName of c.ous) {
        const id = uuid();
        const dn = `ou=${ouName},ou=${c.name},dc=agroamerica,dc=com`;
        await conn.execute(
          'INSERT INTO org_units (id, organization_id, name, dn, level_num) VALUES (:1, :2, :3, :4, 1)',
          [id, orgMap[c.name], ouName, dn]
        );
        ouIds.push(id);
        userCounts.push(Math.floor(20 + Math.random() * 40));
      }
    }
    console.log(`  ${ouIds.length} OUs created`);

    // Admin user
    const adminId = uuid();
    await conn.execute(
      `INSERT INTO users (id, email, display_name, first_name, last_name, is_admin, status, risk_score)
       VALUES (:1, :2, 'Erick Lantan', 'Erick', 'Lantan', 1, 'active', 0)`,
      [adminId, 'elantan@agroamerica.com']
    );

    // Users
    const userIds = [];
    let created = 0;
    for (let o = 0; o < ouIds.length; o++) {
      for (let i = 0; i < userCounts[o]; i++) {
        const id = uuid();
        const first = pick(FIRST_NAMES);
        const last = pick(LAST_NAMES);
        const email = `usuario.${created}@agroamerica.com`;
        const guid = crypto.randomUUID().replace(/-/g, '');
        try {
          await conn.execute(
            `INSERT INTO users (id, ad_object_guid, email, display_name, first_name, last_name, org_unit_id, status, risk_score)
             VALUES (:1, :2, :3, :4, :5, :6, :7, 'active', 0)`,
            [id, guid, email, `${first} ${last}`, first, last, ouIds[o]]
          );
          userIds.push(id);
          created++;
        } catch { continue; }
      }
    }
    console.log(`  ${created} users created`);

    // Courses
    const courseIds = [];
    const courseData = [
      { title: 'Fundamentos de Ciberseguridad', level: 'basico', type: 'video_upload' },
      { title: 'Phishing: Como identificarlo', level: 'basico', type: 'pdf' },
      { title: 'Seguridad Avanzada BASC', level: 'intermedio', type: 'scorm' },
      { title: 'Proteccion de Datos Personales', level: 'avanzado', type: 'video_embed' },
    ];
    for (const c of courseData) {
      const id = uuid();
      await conn.execute(
        `INSERT INTO courses (id, title, description, level_type, course_type)
         VALUES (:1, :2, :3, :4, :5)`,
        [id, c.title, `Curso de ${c.title}`, c.level, c.type]
      );
      courseIds.push(id);
      console.log(`  Course: ${c.title}`);
    }

    // Learning path
    const pathId = uuid();
    await conn.execute(
      `INSERT INTO learning_paths (id, name, description)
       VALUES (:1, 'Ruta Basica BASC', 'Ruta obligatoria de concientizacion')`,
      [pathId]
    );
    for (let i = 0; i < courseIds.length; i++) {
      await conn.execute(
        'INSERT INTO learning_path_courses (id, path_id, course_id, sort_order) VALUES (:1, :2, :3, :4)',
        [uuid(), pathId, courseIds[i], i + 1]
      );
    }

    // Badge
    await conn.execute(
      `INSERT INTO badges (id, name, description, criteria_json)
       VALUES (:1, 'Ruta Basica Completada', 'Completaste la ruta basica', :2)`,
      [uuid(), JSON.stringify({ path_id: pathId, type: 'learning_path' })]
    );

    // Phishing templates
    const templateIds = [];
    const tplData = [
      { name: 'Actualizacion de Contrasena', subject: 'URGENTE: Su contrasena expira en 24h', diff: 'easy', cat: 'phishing' },
      { name: 'Bono Anual RRHH', subject: 'Confirmacion de datos para bono 2026', diff: 'medium', cat: 'phishing' },
    ];
    for (const t of tplData) {
      const id = uuid();
      await conn.execute(
        `INSERT INTO phishing_templates (id, name, subject, html_body, red_flags_json, difficulty, category)
         VALUES (:1, :2, :3, :4, :5, :6, :7)`,
        [id, t.name, t.subject, `<html><body><p>Correo de prueba: ${t.name}</p><a href="{{trackingUrl}}">Clic aqui</a></body></html>`,
          JSON.stringify([{ indicator: 'Urgencia falsa', description: 'Mensaje con urgencia artificial' }]), t.diff, t.cat]
      );
      templateIds.push(id);
    }
    console.log(`  ${templateIds.length} phishing templates`);

    // Campaigns
    const camp1Id = uuid();
    const camp2Id = uuid();
    await conn.execute(
      `INSERT INTO phishing_campaigns (id, name, template_id, status, sent_at)
       VALUES (:1, 'Baseline Q1 2026', :2, 'completed', TIMESTAMP '2026-03-10 10:00:00 +00:00')`,
      [camp1Id, templateIds[0]]
    );
    await conn.execute(
      `INSERT INTO phishing_campaigns (id, name, template_id, status, sent_at)
       VALUES (:1, 'Bono Q2 2026', :2, 'completed', TIMESTAMP '2026-05-15 10:00:00 +00:00')`,
      [camp2Id, templateIds[1]]
    );

    // Phishing results
    const sampleSize = Math.min(userIds.length, 400);
    const sample = userIds.slice(0, sampleSize);
    let clicks1 = 0, clicks2 = 0, reports2 = 0;

    for (const uid of sample) {
      // Campaign 1: 30% click rate
      await conn.execute(
        `INSERT INTO phishing_results (id, user_id, campaign_id, event) VALUES (:1, :2, :3, 'delivered')`,
        [uuid(), uid, camp1Id]
      );
      if (Math.random() < 0.30) {
        await conn.execute(
          `INSERT INTO phishing_results (id, user_id, campaign_id, event) VALUES (:1, :2, :3, 'clicked')`,
          [uuid(), uid, camp1Id]
        );
        await conn.execute(
          `INSERT INTO risk_score_events (id, user_id, delta, reason, source) VALUES (:1, :2, 15, 'Clic en phishing simulado', 'phishing')`,
          [uuid(), uid]
        );
        clicks1++;
      }

      // Campaign 2: 12% click, 8% report
      await conn.execute(
        `INSERT INTO phishing_results (id, user_id, campaign_id, event) VALUES (:1, :2, :3, 'delivered')`,
        [uuid(), uid, camp2Id]
      );
      const r = Math.random();
      if (r < 0.12) {
        await conn.execute(
          `INSERT INTO phishing_results (id, user_id, campaign_id, event) VALUES (:1, :2, :3, 'clicked')`,
          [uuid(), uid, camp2Id]
        );
        await conn.execute(
          `INSERT INTO risk_score_events (id, user_id, delta, reason, source) VALUES (:1, :2, 15, 'Clic en phishing simulado', 'phishing')`,
          [uuid(), uid]
        );
        clicks2++;
      } else if (r < 0.20) {
        await conn.execute(
          `INSERT INTO phishing_results (id, user_id, campaign_id, event) VALUES (:1, :2, :3, 'reported')`,
          [uuid(), uid, camp2Id]
        );
        await conn.execute(
          `INSERT INTO risk_score_events (id, user_id, delta, reason, source) VALUES (:1, :2, -10, 'Reporte PAB', 'pab')`,
          [uuid(), uid]
        );
        reports2++;
      }
    }
    console.log(`  Phishing: Q1 ${clicks1}/${sampleSize} clicks (${Math.round(clicks1 / sampleSize * 100)}%), Q2 ${clicks2} clicks, ${reports2} reports`);

    // Training enrollments
    const tcId = uuid();
    await conn.execute(
      `INSERT INTO training_campaigns (id, name, description, is_ongoing)
       VALUES (:1, 'Capacitacion BASC 2026', 'Capacitacion anual obligatoria', 1)`,
      [tcId]
    );

    const enrollSample = userIds.slice(0, Math.min(userIds.length, 400));
    let stats = { completed: 0, in_progress: 0, assigned: 0 };
    for (const uid of enrollSample) {
      for (const cid of courseIds) {
        const r = Math.random();
        const eId = uuid();
        if (r < 0.45) {
          await conn.execute(
            `INSERT INTO training_enrollments (id, user_id, course_id, campaign_id, status, progress_pct)
             VALUES (:1, :2, :3, :4, 'completed', 100)`, [eId, uid, cid, tcId]);
          stats.completed++;
        } else if (r < 0.65) {
          await conn.execute(
            `INSERT INTO training_enrollments (id, user_id, course_id, campaign_id, status, progress_pct)
             VALUES (:1, :2, :3, :4, 'in_progress', 45)`, [eId, uid, cid, tcId]);
          stats.in_progress++;
        } else {
          await conn.execute(
            `INSERT INTO training_enrollments (id, user_id, course_id, campaign_id, status, progress_pct)
             VALUES (:1, :2, :3, :4, 'assigned', 0)`, [eId, uid, cid, tcId]);
          stats.assigned++;
        }
      }
    }
    console.log(`  Training: ${stats.completed} done, ${stats.in_progress} progress, ${stats.assigned} assigned`);

    // Update risk scores
    await conn.execute(
      `UPDATE users SET risk_score = GREATEST(0, LEAST(100,
        NVL((SELECT SUM(delta) FROM risk_score_events WHERE user_id = users.id), 0)
      )) WHERE org_unit_id IS NOT NULL`
    );

    // Update phish_prone
    await conn.execute(
      `UPDATE users SET phish_prone = CASE WHEN EXISTS (
        SELECT 1 FROM phishing_results WHERE user_id = users.id AND campaign_id = :1 AND event = 'clicked'
      ) THEN 1 ELSE 0 END WHERE id IN (SELECT user_id FROM phishing_results WHERE campaign_id = :2)`,
      [camp2Id, camp2Id]
    );

    // Refresh materialized views
    await conn.execute(`BEGIN DBMS_MVIEW.REFRESH('MV_OU_RISK','C'); END;`);
    await conn.execute(`BEGIN DBMS_MVIEW.REFRESH('MV_ORG_RISK','C'); END;`);
    await conn.execute(`BEGIN DBMS_MVIEW.REFRESH('MV_CAMPAIGN_STATS','C'); END;`);
    await conn.execute(`BEGIN DBMS_MVIEW.REFRESH('MV_TRAINING_PROGRESS','C'); END;`);
    console.log('  Materialized views refreshed');

    // ============ NEW TABLES SEEDING ============

    // Custom Groups
    const group1Id = uuid();
    const group2Id = uuid();
    const group3Id = uuid();
    await conn.execute(
      `INSERT INTO custom_groups (id, name, description, created_by) VALUES (:1, :2, :3, :4)`,
      [group1Id, 'Equipo de TI Guatemala', 'Personal del departamento de TI en oficinas centrales', adminId]
    );
    await conn.execute(
      `INSERT INTO custom_groups (id, name, description, created_by) VALUES (:1, :2, :3, :4)`,
      [group2Id, 'Gerentes de Operaciones', 'Jefes de operaciones en todas las plantas', adminId]
    );
    await conn.execute(
      `INSERT INTO custom_groups (id, name, description, created_by) VALUES (:1, :2, :3, :4)`,
      [group3Id, 'Alto Riesgo Reincidentes', 'Usuarios que han hecho clic en phishing mas de una vez', adminId]
    );

    // Add members to groups
    const groupSample1 = userIds.slice(0, 15);
    const groupSample2 = userIds.slice(15, 30);
    for (const uid of groupSample1) {
      await conn.execute(
        'INSERT INTO custom_group_members (id, group_id, user_id) VALUES (:1, :2, :3)',
        [uuid(), group1Id, uid]
      );
    }
    for (const uid of groupSample2) {
      await conn.execute(
        'INSERT INTO custom_group_members (id, group_id, user_id) VALUES (:1, :2, :3)',
        [uuid(), group2Id, uid]
      );
    }
    console.log(`  3 custom groups created with members`);

    // Course Questions (quiz for course 1)
    const quizQuestions = [
      {
        text: 'Cual de las siguientes es una buena practica de seguridad?',
        options: [
          { text: 'Compartir contraseñas por correo', correct: false },
          { text: 'Usar autenticacion de dos factores', correct: true },
          { text: 'Usar la misma contraseña en todos los servicios', correct: false },
          { text: 'Desactivar el antivirus para mayor velocidad', correct: false },
        ],
      },
      {
        text: 'Que debe hacer si recibe un correo sospechoso?',
        options: [
          { text: 'Hacer clic para verificar si es real', correct: false },
          { text: 'Reenviar al equipo de seguridad o usar PAB', correct: true },
          { text: 'Ignorarlo y eliminarlo sin reportar', correct: false },
          { text: 'Responder pidiendo mas informacion', correct: false },
        ],
      },
      {
        text: 'Que es phishing?',
        options: [
          { text: 'Un tipo de virus informatico', correct: false },
          { text: 'Un ataque que busca engañar para robar informacion', correct: true },
          { text: 'Un software de proteccion', correct: false },
          { text: 'Un tipo de firewall', correct: false },
        ],
      },
    ];

    for (let qi = 0; qi < quizQuestions.length; qi++) {
      const qId = uuid();
      await conn.execute(
        'INSERT INTO course_questions (id, course_id, question_text, question_type, sort_order, is_required) VALUES (:1, :2, :3, :4, :5, 1)',
        [qId, courseIds[0], quizQuestions[qi].text, 'multiple_choice', qi + 1]
      );
      for (let oi = 0; oi < quizQuestions[qi].options.length; oi++) {
        await conn.execute(
          'INSERT INTO course_question_options (id, question_id, option_text, is_correct, sort_order) VALUES (:1, :2, :3, :4, :5)',
          [uuid(), qId, quizQuestions[qi].options[oi].text, quizQuestions[qi].options[oi].correct ? 1 : 0, oi + 1]
        );
      }
    }
    console.log(`  ${quizQuestions.length} quiz questions with options created`);

    // Physical Tests
    const usbTestId = uuid();
    const qrTestId = uuid();
    await conn.execute(
      `INSERT INTO physical_tests (id, test_type, name, description, location, tracking_code, status, created_by)
       VALUES (:1, 'usb', 'USB Lobby Corporativo', 'USB con archivo beacon en recepcion edificio A', 'Recepcion Edificio A, Guatemala', 'USB-DEMO0001', 'active', :2)`,
      [usbTestId, adminId]
    );
    await conn.execute(
      `INSERT INTO physical_tests (id, test_type, name, description, location, tracking_code, status, created_by)
       VALUES (:1, 'qr', 'QR Cafeteria Planta 2', 'Cartel con QR de prueba en la cafeteria principal', 'Cafeteria Planta 2, Agrocaribe', 'QR-DEMO0001', 'active', :2)`,
      [qrTestId, adminId]
    );

    // Add some events to physical tests
    for (let i = 0; i < 5; i++) {
      await conn.execute(
        `INSERT INTO physical_test_events (id, test_id, user_id, event_type, ip, location_detail)
         VALUES (:1, :2, :3, 'usb_connected', '192.168.1.' || :4, 'Escritorio del usuario')`,
        [uuid(), usbTestId, userIds[Math.floor(Math.random() * 50)], String(100 + i)]
      );
    }
    for (let i = 0; i < 8; i++) {
      await conn.execute(
        `INSERT INTO physical_test_events (id, test_id, user_id, event_type, ip, location_detail)
         VALUES (:1, :2, :3, 'qr_scanned', '10.0.0.' || :4, 'Dispositivo movil')`,
        [uuid(), qrTestId, userIds[Math.floor(Math.random() * 80)], String(50 + i)]
      );
    }
    console.log('  2 physical tests with events created');

    // User Notifications
    const notifData = [
      { scope: 'all', title: 'Bienvenido a eLearning AgroAmerica', body: 'La plataforma de concientizacion en ciberseguridad esta activa. Revise su capacitacion asignada.', category: 'info' },
      { scope: 'all', title: 'Nueva campana de phishing completada', body: 'La campana "Bono Q2 2026" finalizo con 12% de click rate. Revise los resultados.', category: 'phishing' },
      { scope: 'all', title: 'Capacitacion BASC 2026 lanzada', body: 'Se ha asignado la ruta basica BASC a toda la organizacion. Fecha limite: 30 de septiembre.', category: 'training' },
      { scope: 'admins', title: 'Usuario de alto riesgo detectado', body: 'El usuario Juan Garcia ha superado el umbral de riesgo (score: 45). Se recomienda capacitacion inmediata.', category: 'security' },
      { scope: 'admins', title: 'Sync AD completado', body: 'Sincronizacion con Active Directory completada: 0 nuevos, 0 desactivados.', category: 'info' },
      { scope: 'all', title: 'Consejo de la semana', body: 'Nunca comparta sus credenciales por correo electronico, incluso si parece venir de TI.', category: 'security' },
    ];
    for (const n of notifData) {
      await conn.execute(
        `INSERT INTO user_notifications (id, target_scope, title, body, category)
         VALUES (:1, :2, :3, :4, :5)`,
        [uuid(), n.scope, n.title, n.body, n.category]
      );
    }
    console.log(`  ${notifData.length} notifications created`);

    // PAB Reports
    for (let i = 0; i < 25; i++) {
      const uid = pick(userIds);
      const simulated = Math.random() < 0.4;
      await conn.execute(
        `INSERT INTO pab_reports (id, user_id, reported_subject, was_simulated, campaign_id)
         VALUES (:1, :2, :3, :4, :5)`,
        [uuid(), uid,
        pick(['URGENTE: Verifique su cuenta', 'Tiene un paquete pendiente', 'Actualizacion de contrasena requerida', 'Felicitaciones: Gano un premio']),
        simulated ? 1 : 0,
        simulated ? camp2Id : null]
      );
    }
    console.log('  25 PAB reports created');

    // Additional badges
    const badgeData = [
      { name: 'Primer Reporte PAB', desc: 'Reporto su primer correo sospechoso', criteria: { type: 'pab_count', min: 1 } },
      { name: 'Guardian Digital', desc: 'Reporto 5 correos sospechosos', criteria: { type: 'pab_count', min: 5 } },
      { name: 'Sin Mordida', desc: 'No hizo clic en ninguna campana de phishing', criteria: { type: 'zero_clicks' } },
      { name: 'Estudiante Dedicado', desc: 'Completo todos los cursos asignados', criteria: { type: 'all_courses_completed' } },
    ];
    for (const b of badgeData) {
      await conn.execute(
        `INSERT INTO badges (id, name, description, criteria_json) VALUES (:1, :2, :3, :4)`,
        [uuid(), b.name, b.desc, JSON.stringify(b.criteria)]
      );
    }
    console.log(`  ${badgeData.length + 1} badges created`);

    await conn.execute('COMMIT');

    console.log('\n=== Seed complete ===');
    console.log(`Organizations: ${COMPANIES.length}`);
    console.log(`OUs: ${ouIds.length}`);
    console.log(`Users: ${created + 1}`);
    console.log(`Courses: ${courseIds.length}`);
    console.log(`Phishing campaigns: 2`);
    console.log(`Custom groups: 3`);
    console.log(`Physical tests: 2 (USB + QR)`);
    console.log(`Notifications: ${notifData.length}`);
    console.log(`Quiz questions: ${quizQuestions.length}`);
    console.log(`PAB reports: 25`);
    console.log(`Admin: elantan@agroamerica.com`);

  } finally {
    if (conn) await conn.close();
  }
}

seed().catch(err => { console.error('SEED ERROR:', err.message); process.exit(1); });
