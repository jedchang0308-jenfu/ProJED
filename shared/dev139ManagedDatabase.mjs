import { URL } from 'node:url';
import { TextDecoder } from 'node:util';

export const MANAGED_DATABASE = Object.freeze({
  host: 'cloud-sql-iam',
  cloudSqlInstance: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  databaseName: 'jenfu_prod',
  databasePort: 5432,
  iamLogins: Object.freeze({
    runtime: 'projed-prod-runtime@projed-cc78d.iam',
    migrator: 'projed-prod-migrator@projed-cc78d.iam',
    importer: 'projed-prod-importer@projed-cc78d.iam',
  }),
  roles: Object.freeze({
    owner: 'projed_owner_disposable', migrator: 'projed_migrator_disposable',
    importer: 'projed_importer_disposable', runtime: 'projed_runtime_disposable',
  }),
});

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function assertPurpose(purpose) {
  if (!Object.hasOwn(MANAGED_DATABASE.iamLogins, purpose)) fail('CONFIG_INVALID', 'Unknown database lifecycle');
}

export function assertManagedIamLogins(logins) {
  if (!logins || typeof logins !== 'object' || Array.isArray(logins)
      || Object.keys(logins).sort().join('|') !== 'importer|migrator|runtime'
      || Object.entries(MANAGED_DATABASE.iamLogins).some(([key, login]) => logins[key] !== login)) {
    fail('CONFIG_INVALID', 'Managed IAM logins do not match the app lifecycle identities');
  }
}

function assertBinding(binding) {
  assertManagedIamLogins(binding.iamLogins);
  if (binding.connectionMode !== MANAGED_DATABASE.host
      || binding.cloudSqlInstance !== MANAGED_DATABASE.cloudSqlInstance
      || binding.databaseName !== MANAGED_DATABASE.databaseName
      || binding.databasePort !== MANAGED_DATABASE.databasePort
      || binding.runtimeRole !== MANAGED_DATABASE.roles.runtime) {
    fail('CONFIG_INVALID', 'Managed binding is outside the owned target');
  }
}

/** Runtime uses the private IAM proxy's TCP port; one-off Jobs use its socket. */
export function validateManagedDatabaseUrl(raw, binding, purpose) {
  assertPurpose(purpose);
  assertBinding(binding);
  let url;
  try {
    url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
        || decodeURIComponent(url.username) !== binding.iamLogins[purpose]
        || url.password !== '' || url.hash !== ''
        || decodeURIComponent(url.pathname.slice(1)) !== binding.databaseName
        || Number(url.port || '5432') !== MANAGED_DATABASE.databasePort) throw new Error();
    if (purpose === 'runtime') {
      if (url.hostname !== '127.0.0.1' || url.search !== '') throw new Error();
    } else if (url.hostname !== 'localhost'
        || [...url.searchParams.keys()].join('|') !== 'host'
        || url.searchParams.get('host') !== `/cloudsql/${binding.cloudSqlInstance}`) throw new Error();
  } catch {
    // Never retain a URL parser error whose input can contain credentials.
    fail('CONFIG_INVALID', 'Managed database URL is outside its lifecycle binding');
  }
  return url;
}

/** One token per short-lived Job, following the existing owner runner pattern. */
export async function fetchManagedJobToken(fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google', accept: 'application/json' },
      redirect: 'error', signal: globalThis.AbortSignal.timeout(10_000),
    });
    if (response.status !== 200 || response.redirected || !response.body) throw new Error();
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 16 * 1024) { await reader.cancel(); throw new Error(); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof value.access_token !== 'string' || value.access_token.length < 20
        || value.access_token.length > 8192 || /[\s\p{Cc}]/u.test(value.access_token)
        || value.token_type !== 'Bearer' || !Number.isSafeInteger(value.expires_in)
        || value.expires_in < 60 || value.expires_in > 86400) throw new Error();
    return value.access_token;
  } catch { fail('DB_AUTH_UNAVAILABLE', 'Managed database authentication is unavailable'); }
}

export function managedJobConnectionOptions(raw, binding, purpose, token) {
  if (purpose !== 'migrator' && purpose !== 'importer') fail('CONFIG_INVALID', 'Only Jobs use an explicit IAM token');
  const url = validateManagedDatabaseUrl(raw, binding, purpose);
  if (typeof token !== 'string' || token.length < 20 || token.length > 8192 || /[\s\p{Cc}]/u.test(token)) {
    fail('DB_AUTH_UNAVAILABLE', 'Managed database authentication is unavailable');
  }
  // Do not combine password with connectionString: pg parses an empty URL
  // password over that value. These explicit options keep the token ephemeral.
  return { host: url.searchParams.get('host'), port: MANAGED_DATABASE.databasePort,
    database: binding.databaseName, user: binding.iamLogins[purpose], password: token, ssl: false };
}

const ROLE_SQL = Object.freeze({
  runtime: 'SET ROLE projed_runtime_disposable',
  migrator: 'SET ROLE projed_migrator_disposable',
  importer: 'SET ROLE projed_importer_disposable',
});

/** Verify the real login before using the fixed app role required by frozen SQL. */
export async function prepareManagedDatabaseSession(client, binding, purpose) {
  assertPurpose(purpose);
  assertBinding(binding);
  const appRole = MANAGED_DATABASE.roles[purpose];
  const allowedRoles = [appRole, 'cloudsqliamuser'];
  if (purpose === 'migrator') allowedRoles.push(MANAGED_DATABASE.roles.owner);
  const result = await client.query(`
    SELECT current_database() AS database_name, session_user::text AS login_name,
           current_user::text AS role_name,
           NOT (login.rolsuper OR login.rolbypassrls OR login.rolcreatedb
             OR login.rolcreaterole OR login.rolreplication) AS login_safe,
           NOT (app.rolcanlogin OR app.rolsuper OR app.rolbypassrls OR app.rolcreatedb
             OR app.rolcreaterole OR app.rolreplication) AS app_role_safe,
           pg_catalog.pg_has_role(session_user, app.oid, 'MEMBER')
           AND NOT EXISTS (
             SELECT 1 FROM pg_catalog.pg_roles AS member_role
              WHERE member_role.rolname <> session_user
                AND pg_catalog.pg_has_role(session_user, member_role.oid, 'MEMBER')
                AND (NOT (member_role.rolname = ANY($2::text[])) OR member_role.rolsuper
                  OR member_role.rolbypassrls OR member_role.rolcreatedb
                  OR member_role.rolcreaterole OR member_role.rolreplication)
           ) AS roles_isolated,
           NOT pg_catalog.pg_has_role(session_user,
             (SELECT datdba FROM pg_catalog.pg_database WHERE datname = current_database()), 'MEMBER') AS not_database_owner,
           NOT EXISTS (
             SELECT 1 FROM pg_catalog.pg_namespace AS ns
              WHERE right(ns.nspname, 5) = '_core' AND ns.nspname <> 'projed_core'
                AND (pg_catalog.has_schema_privilege(session_user, ns.oid, 'USAGE')
                  OR pg_catalog.has_schema_privilege(session_user, ns.oid, 'CREATE'))
           ) AS no_sibling_core
      FROM pg_catalog.pg_roles AS login
      JOIN pg_catalog.pg_roles AS app ON app.rolname = $1
     WHERE login.rolname = session_user
  `, [appRole, allowedRoles]);
  const row = result.rows[0];
  if (result.rows.length !== 1 || row.database_name !== binding.databaseName
      || row.login_name !== binding.iamLogins[purpose]
      || ![row.login_name, appRole].includes(row.role_name)
      || ['login_safe', 'app_role_safe', 'roles_isolated', 'not_database_owner', 'no_sibling_core']
        .some(key => row[key] !== true)) {
    fail('DB_BOUNDARY_INVALID', 'Managed database session identity or privileges are invalid');
  }
  await client.query(ROLE_SQL[purpose]);
  const active = await client.query('SELECT session_user::text AS login_name, current_user::text AS role_name');
  if (active.rows.length !== 1 || active.rows[0].login_name !== binding.iamLogins[purpose]
      || active.rows[0].role_name !== appRole) {
    fail('DB_BOUNDARY_INVALID', 'Managed database app role was not established');
  }
}
