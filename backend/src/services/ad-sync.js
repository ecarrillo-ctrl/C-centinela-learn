import { Client } from 'ldapts';
import { query } from '../db.js';

const LDAP_URL = process.env.LDAP_URL || 'ldap://openldap:389';
const LDAP_BIND_DN = process.env.LDAP_BIND_DN || 'cn=admin,dc=agroamerica,dc=com';
const LDAP_BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD || 'admin';
const LDAP_SEARCH_BASE = process.env.LDAP_SEARCH_BASE || 'dc=agroamerica,dc=com';
const LDAP_USER_FILTER = process.env.LDAP_USER_FILTER || '(&(objectClass=user)(objectCategory=person))';
const LDAP_PAGE_SIZE = parseInt(process.env.LDAP_PAGE_SIZE || '500', 10);
const DRY_RUN = process.env.LDAP_DRY_RUN === 'true';

function parseDN(dn) {
  const parts = dn.split(',').map(part => {
    const [key, ...vals] = part.trim().split('=');
    return { key: key.trim().toLowerCase(), value: vals.join('=') };
  });
  return parts.filter(p => p.key === 'ou' || p.key === 'dc');
}

function getParentDN(dn) {
  const parts = dn.split(',').map(s => s.trim());
  if (parts.length <= 1) return null;
  return parts.slice(1).join(',');
}

function deriveOrgName(ouName) {
  const mapping = {
    'agrocaribe': 'Agrocaribe',
    'frutera': 'Frutera del Pacifico',
    'corporativo': 'Corporativo',
    'propasa': 'Propasa',
    'agropalma': 'AgroPalma',
    'interlogic': 'Interlogic/Aldersa',
    'aldersa': 'Interlogic/Aldersa',
  };
  const lower = ouName.toLowerCase();
  return mapping[lower] || ouName;
}

function formatGUID(guidBuffer) {
  // AD objectGUID viene como Buffer — convertir a string hex
  if (Buffer.isBuffer(guidBuffer)) {
    return guidBuffer.toString('hex').toLowerCase();
  }
  if (typeof guidBuffer === 'string') {
    return guidBuffer.replace(/[^a-f0-9]/gi, '').toLowerCase();
  }
  return '';
}

export async function syncAD(options = {}) {
  const isDryRun = options.dryRun !== undefined ? options.dryRun : DRY_RUN;
  const stats = {
    orgUnits: { created: 0, existing: 0 },
    users: { created: 0, reactivated: 0, deactivated: 0, unchanged: 0 },
    errors: [],
    dryRun: isDryRun,
  };

  const client = new Client({
    url: LDAP_URL,
    timeout: 60000,
    connectTimeout: 10000,
    tlsOptions: {
      rejectUnauthorized: false,  // Aceptar cert self-signed del AD interno
    },
  });

  try {
    await client.bind(LDAP_BIND_DN, LDAP_BIND_PASSWORD);

    const allUsers = [];
    const allOUs = [];

    const userPaginator = client.searchPaginated(LDAP_SEARCH_BASE, {
      scope: 'sub',
      filter: LDAP_USER_FILTER,
      attributes: ['*', 'objectGUID', 'memberOf', 'manager', 'whenChanged'],
      paged: { pageSize: LDAP_PAGE_SIZE },
      sizeLimit: 0,
      timeLimit: 0,
    });

    for await (const result of userPaginator) {
      for (const entry of result.searchEntries) {
        allUsers.push(entry);
      }
    }

    const ouPaginator = client.searchPaginated(LDAP_SEARCH_BASE, {
      scope: 'sub',
      filter: '(objectClass=organizationalUnit)',
      attributes: ['*', 'objectGUID', 'whenChanged'],
      paged: { pageSize: LDAP_PAGE_SIZE },
      sizeLimit: 0,
      timeLimit: 0,
    });

    for await (const result of ouPaginator) {
      for (const entry of result.searchEntries) {
        allOUs.push(entry);
      }
    }

    console.log(`[AD-SYNC] Found ${allUsers.length} users, ${allOUs.length} OUs from LDAP`);

    if (!isDryRun) {
      stats.orgUnits = await syncOUs(allOUs, stats);
    } else {
      for (const ou of allOUs) {
        const existing = await query(
          'SELECT id FROM org_units WHERE dn = $1', [ou.objectName || ou.dn]
        );
        if (existing.rows.length > 0) stats.orgUnits.existing++;
        else stats.orgUnits.created++;
      }
    }

    if (!isDryRun) {
      stats.users = await syncUsers(allUsers, stats);
    } else {
      for (const user of allUsers) {
        const guid = formatGUID(user.objectGUID || user.entryUUID || '');
        const existing = await query(
          'SELECT id, status FROM users WHERE ad_object_guid = $1', [guid]
        );
        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          if (row.status === 'inactive') stats.users.reactivated++;
          else stats.users.unchanged++;
        } else {
          stats.users.created++;
        }
      }

      const { rows: activeInDb } = await query(
        "SELECT id FROM users WHERE ad_object_guid IS NOT NULL AND status = 'active'"
      );
      const currentGuids = new Set(allUsers.map(u => formatGUID(u.objectGUID || u.entryUUID || '')));
      const toDeactivate = activeInDb.filter(u => !currentGuids.has(u.ad_object_guid));
      stats.users.deactivated = toDeactivate.length;
    }

    await client.unbind();
  } catch (err) {
    console.error('[AD-SYNC] Error:', err.message);
    stats.errors.push(err.message);
    try { await client.unbind(); } catch { }
  }

  return stats;
}

async function syncOUs(ldapOUs, stats) {
  const result = { created: 0, existing: 0 };

  for (const entry of ldapOUs) {
    const dn = String(entry.objectName || entry.dn || '');
    const name = entry.ou ? String(entry.ou) : dn.split(',')[0].replace('ou=', '');
    const parentDn = getParentDN(dn);

    let parentId = null;
    if (parentDn) {
      const { rows } = await query('SELECT id FROM org_units WHERE dn = $1', [parentDn]);
      if (rows.length > 0) parentId = rows[0].id;
    }

    const topOu = dn.split(',')
      .map(s => s.trim())
      .filter(s => s.toLowerCase().startsWith('ou='))
      .pop()
      ?.replace(/^ou=/i, '') || name;

    const orgName = deriveOrgName(topOu);

    const { rows: orgRows } = await query('SELECT id FROM organizations WHERE name = $1', [orgName]);
    if (orgRows.length === 0) {
      await query('INSERT INTO organizations (name) VALUES ($1)', [orgName]);
    }

    const { rows: orgRows2 } = await query('SELECT id FROM organizations WHERE name = $1', [orgName]);
    const orgId = orgRows2[0]?.id;

    const level = dn.split(',').filter(s => s.trim().toLowerCase().startsWith('ou=')).length;

    const existing = await query('SELECT id FROM org_units WHERE dn = $1', [dn]);
    if (existing.rows.length > 0) {
      await query(
        `UPDATE org_units SET name = $1, parent_id = $2, organization_id = $3, level_num = $4
         WHERE dn = $5`,
        [name, parentId, orgId, level, dn]
      );
      result.existing++;
    } else {
      await query(
        `INSERT INTO org_units (name, dn, parent_id, organization_id, level, ad_object_guid)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [name, dn, parentId, orgId, level, entry.objectGUID ? formatGUID(entry.objectGUID) : null]
      );
      result.created++;
    }
  }

  return result;
}

async function syncUsers(ldapUsers, stats) {
  const result = { created: 0, reactivated: 0, deactivated: 0, unchanged: 0 };

  const processedGuids = new Set();

  for (const entry of ldapUsers) {
    const guid = formatGUID(entry.entryUUID || entry.objectGUID || '');
    if (!guid) continue;
    processedGuids.add(guid);

    const email = entry.mail ? String(entry.mail) : '';
    const displayName = entry.displayName ? String(entry.displayName) : String(entry.cn || '');
    const firstName = entry.givenName ? String(entry.givenName) : '';
    const lastName = entry.sn ? String(entry.sn) : '';
    const dn = String(entry.objectName || entry.dn || '');

    const ouDn = getParentDN(dn);
    let orgUnitId = null;
    if (ouDn) {
      const { rows } = await query('SELECT id FROM org_units WHERE dn = $1', [ouDn]);
      if (rows.length > 0) orgUnitId = rows[0].id;
    }

    const existing = await query('SELECT id, status FROM users WHERE ad_object_guid = $1', [guid]);

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.status === 'inactive') {
        await query(
          `UPDATE users SET status = 'active', deactivated_at = NULL, email = $1,
           display_name = $2, first_name = $3, last_name = $4, org_unit_id = $5,
           ad_object_guid = $6
           WHERE id = $7`,
          [email, displayName, firstName, lastName, orgUnitId, guid, row.id]
        );
        result.reactivated++;
      } else {
        await query(
          `UPDATE users SET email = $1, display_name = $2, first_name = $3, last_name = $4,
           org_unit_id = $5
           WHERE id = $6`,
          [email, displayName, firstName, lastName, orgUnitId, row.id]
        );
        result.unchanged++;
      }
    } else {
      const byEmail = await query(
        'SELECT id, status, ad_object_guid FROM users WHERE email = $1',
        [email]
      );
      if (byEmail.rows.length > 0) {
        const erow = byEmail.rows[0];
        await query(
          `UPDATE users SET ad_object_guid = $1, status = 'active', deactivated_at = NULL,
           display_name = $2, first_name = $3, last_name = $4, org_unit_id = $5
           WHERE id = $6`,
          [guid, displayName, firstName, lastName, orgUnitId, erow.id]
        );
        if (erow.status === 'inactive') result.reactivated++;
        else result.unchanged++;
      } else {
        await query(
          `INSERT INTO users (ad_object_guid, email, display_name, first_name, last_name, org_unit_id, status, risk_score)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', 0)`,
          [guid, email, displayName, firstName, lastName, orgUnitId]
        );
        result.created++;
      }
    }
  }

  const { rows: activeInDb } = await query(
    "SELECT id, ad_object_guid FROM users WHERE ad_object_guid IS NOT NULL AND status = 'active'"
  );

  for (const user of activeInDb) {
    if (!processedGuids.has(user.ad_object_guid)) {
      await query(
        "UPDATE users SET status = 'inactive', deactivated_at = SYSTIMESTAMP WHERE id = $1",
        [user.id]
      );
      result.deactivated++;
    }
  }

  return result;
}
