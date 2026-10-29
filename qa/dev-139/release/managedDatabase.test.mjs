import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { URL } from 'node:url';

import {
  MANAGED_DATABASE,
  assertManagedIamLogins,
  fetchManagedJobToken,
  managedJobConnectionOptions,
  prepareManagedDatabaseSession,
  validateManagedDatabaseUrl,
} from '../../../shared/dev139ManagedDatabase.mjs';

const BINDING = {
  databaseName: MANAGED_DATABASE.databaseName,
  databasePort: MANAGED_DATABASE.databasePort,
  runtimeRole: MANAGED_DATABASE.roles.runtime,
  connectionMode: MANAGED_DATABASE.host,
  cloudSqlInstance: MANAGED_DATABASE.cloudSqlInstance,
  iamLogins: { ...MANAGED_DATABASE.iamLogins },
};

const JOB_TOKEN = 'ephemeral-managed-job-token-value';

function urlFor(purpose) {
  const login = encodeURIComponent(BINDING.iamLogins[purpose]);
  const host = purpose === 'runtime' ? '127.0.0.1' : 'localhost';
  const url = new URL(`postgresql://${login}@${host}:${BINDING.databasePort}/${BINDING.databaseName}`);
  if (purpose !== 'runtime') url.searchParams.set('host', `/cloudsql/${BINDING.cloudSqlInstance}`);
  return url.toString();
}

function identityRow(purpose, overrides = {}) {
  return {
    database_name: BINDING.databaseName,
    login_name: BINDING.iamLogins[purpose],
    role_name: BINDING.iamLogins[purpose],
    login_safe: true,
    app_role_safe: true,
    roles_isolated: true,
    not_database_owner: true,
    no_sibling_core: true,
    ...overrides,
  };
}

function sessionClient(purpose, { initialRow = identityRow(purpose), initialRows, activeRow } = {}) {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (calls.length === 1) return { rows: initialRows ?? (initialRow ? [initialRow] : []) };
      if (calls.length === 2) return { rows: [] };
      return { rows: [activeRow ?? {
        login_name: BINDING.iamLogins[purpose],
        role_name: MANAGED_DATABASE.roles[purpose],
      }] };
    },
  };
  return { client, calls };
}

function fakeResponse({ status = 200, redirected = false, body }) {
  const bytes = Buffer.from(body);
  let offset = 0;
  return {
    status,
    redirected,
    body: {
      getReader() {
        return {
          async read() {
            if (offset >= bytes.length) return { done: true };
            const value = bytes.subarray(offset, Math.min(offset + 4096, bytes.length));
            offset += value.length;
            return { done: false, value };
          },
          async cancel() { offset = bytes.length; },
          releaseLock() {},
        };
      },
    },
  };
}

function tokenBody(overrides = {}) {
  return JSON.stringify({
    access_token: JOB_TOKEN,
    token_type: 'Bearer',
    expires_in: 3600,
    ...overrides,
  });
}

async function assertManagedAuthFailure(fetchImpl) {
  await assert.rejects(fetchManagedJobToken(fetchImpl), error => {
    assert.equal(error.code, 'DB_AUTH_UNAVAILABLE');
    assert.equal(error.message, 'Managed database authentication is unavailable');
    assert.doesNotMatch(error.message, /secret|marker|token-value/u);
    return true;
  });
}

test('managed IAM login map is exact and rejects additional or changed identities', () => {
  assertManagedIamLogins(BINDING.iamLogins);
  assert.throws(() => assertManagedIamLogins({ ...BINDING.iamLogins, extra: 'unexpected' }), {
    code: 'CONFIG_INVALID',
  });
  assert.throws(() => assertManagedIamLogins({ ...BINDING.iamLogins, runtime: 'other@project.iam' }), {
    code: 'CONFIG_INVALID',
  });
  assert.throws(() => assertManagedIamLogins({ migrator: BINDING.iamLogins.migrator }), {
    code: 'CONFIG_INVALID',
  });
});

test('managed database URLs accept each purpose only at its bound endpoint', () => {
  for (const purpose of ['runtime', 'migrator', 'importer']) {
    assert.equal(validateManagedDatabaseUrl(urlFor(purpose), BINDING, purpose).pathname, `/${BINDING.databaseName}`);

    const wrongLogin = new URL(urlFor(purpose));
    wrongLogin.username = 'another-login';
    assert.throws(() => validateManagedDatabaseUrl(wrongLogin.toString(), BINDING, purpose), {
      code: 'CONFIG_INVALID',
    });

    const withPassword = new URL(urlFor(purpose));
    withPassword.password = 'private-marker';
    assert.throws(() => validateManagedDatabaseUrl(withPassword.toString(), BINDING, purpose), {
      code: 'CONFIG_INVALID',
    });

    const wrongHost = new URL(urlFor(purpose));
    wrongHost.hostname = 'unbound.example.test';
    assert.throws(() => validateManagedDatabaseUrl(wrongHost.toString(), BINDING, purpose), {
      code: 'CONFIG_INVALID',
    });

    const wrongDatabase = new URL(urlFor(purpose));
    wrongDatabase.pathname = '/other_database';
    assert.throws(() => validateManagedDatabaseUrl(wrongDatabase.toString(), BINDING, purpose), {
      code: 'CONFIG_INVALID',
    });

    const wrongPort = new URL(urlFor(purpose));
    wrongPort.port = '5433';
    assert.throws(() => validateManagedDatabaseUrl(wrongPort.toString(), BINDING, purpose), {
      code: 'CONFIG_INVALID',
    });

    if (purpose === 'runtime') {
      const wrongTransport = new URL(urlFor(purpose));
      wrongTransport.searchParams.set('sslmode', 'require');
      assert.throws(() => validateManagedDatabaseUrl(wrongTransport.toString(), BINDING, purpose), {
        code: 'CONFIG_INVALID',
      });
    } else {
      const wrongInstance = new URL(urlFor(purpose));
      wrongInstance.searchParams.set('host', '/cloudsql/other-project:region:instance');
      assert.throws(() => validateManagedDatabaseUrl(wrongInstance.toString(), BINDING, purpose), {
        code: 'CONFIG_INVALID',
      });

      const extraOption = new URL(urlFor(purpose));
      extraOption.searchParams.set('sslmode', 'require');
      assert.throws(() => validateManagedDatabaseUrl(extraOption.toString(), BINDING, purpose), {
        code: 'CONFIG_INVALID',
      });
    }
  }

  for (const invalidBinding of [
    { ...BINDING, databaseName: 'other_database' },
    { ...BINDING, databasePort: 5433 },
    { ...BINDING, cloudSqlInstance: 'other-project:region:instance' },
    { ...BINDING, connectionMode: 'cloud-sql-unix' },
    { ...BINDING, runtimeRole: 'other_runtime_role' },
  ]) {
    assert.throws(() => validateManagedDatabaseUrl(urlFor('runtime'), invalidBinding, 'runtime'), {
      code: 'CONFIG_INVALID',
    });
  }

  assert.throws(() => validateManagedDatabaseUrl(urlFor('runtime'), BINDING, 'owner'), {
    code: 'CONFIG_INVALID',
  });
  assert.throws(() => validateManagedDatabaseUrl('postgresql://private-marker', BINDING, 'runtime'), error => {
    assert.equal(error.code, 'CONFIG_INVALID');
    assert.equal(error.message, 'Managed database URL is outside its lifecycle binding');
    assert.doesNotMatch(error.message, /private-marker/u);
    return true;
  });
});

test('managed Job connection options keep IAM token out of the connection string', () => {
  for (const purpose of ['migrator', 'importer']) {
    assert.deepEqual(managedJobConnectionOptions(urlFor(purpose), BINDING, purpose, JOB_TOKEN), {
      host: `/cloudsql/${BINDING.cloudSqlInstance}`,
      port: BINDING.databasePort,
      database: BINDING.databaseName,
      user: BINDING.iamLogins[purpose],
      password: JOB_TOKEN,
      ssl: false,
    });
  }
  assert.throws(() => managedJobConnectionOptions(urlFor('runtime'), BINDING, 'runtime', JOB_TOKEN), {
    code: 'CONFIG_INVALID',
  });
  assert.throws(() => managedJobConnectionOptions(urlFor('importer'), BINDING, 'importer', 'invalid token'), {
    code: 'DB_AUTH_UNAVAILABLE',
  });
});

test('managed Job token fetch uses only the injected fetch and accepts a valid ephemeral token', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return fakeResponse({ body: tokenBody() });
  };

  assert.equal(await fetchManagedJobToken(fetchImpl), JOB_TOKEN);
  assert.equal(request.url, 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token');
  assert.deepEqual(request.options.headers, { 'Metadata-Flavor': 'Google', accept: 'application/json' });
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.signal.aborted, false);
});

test('managed Job token fetch fails generically for denied, oversized, malformed, expired, or whitespace responses', async () => {
  const cases = [
    ['denied response', fakeResponse({ status: 403, body: 'private-marker-denied' })],
    ['oversized response', fakeResponse({ body: tokenBody({ access_token: 'x'.repeat(17 * 1024) }) })],
    ['malformed response', fakeResponse({ body: 'private-marker-not-json' })],
    ['expired token', fakeResponse({ body: tokenBody({ access_token: 'private-marker-expired-token', expires_in: 59 }) })],
    ['whitespace token', fakeResponse({ body: tokenBody({ access_token: 'private-marker token-with-space' }) })],
    ['redirected response', fakeResponse({ redirected: true, body: tokenBody() })],
  ];

  for (const [label, response] of cases) {
    await assertManagedAuthFailure(async () => response).catch(error => {
      error.message = `${label}: ${error.message}`;
      throw error;
    });
  }
  await assertManagedAuthFailure(async () => { throw new Error('private-marker-network-error'); });
});

test('managed session verifies each actual login and enters only its fixed lifecycle role', async () => {
  let firstQueryText;
  for (const purpose of ['runtime', 'migrator', 'importer']) {
    const { client, calls } = sessionClient(purpose);
    await prepareManagedDatabaseSession(client, BINDING, purpose);

    assert.equal(calls.length, 3);
    firstQueryText ??= calls[0].text;
    assert.equal(calls[0].text, firstQueryText);
    assert.match(calls[0].text, /session_user/u);
    assert.deepEqual(calls[0].values, [
      MANAGED_DATABASE.roles[purpose],
      purpose === 'migrator'
        ? [MANAGED_DATABASE.roles.migrator, 'cloudsqliamuser', MANAGED_DATABASE.roles.owner]
        : [MANAGED_DATABASE.roles[purpose], 'cloudsqliamuser'],
    ]);
    for (const value of [
      ...Object.values(BINDING.iamLogins),
      ...Object.values(MANAGED_DATABASE.roles),
    ]) assert.equal(calls[0].text.includes(value), false);
    assert.equal(calls[1].text, `SET ROLE ${MANAGED_DATABASE.roles[purpose]}`);
    assert.deepEqual(calls[1].values, undefined);
    assert.equal(calls[2].text, 'SELECT session_user::text AS login_name, current_user::text AS role_name');
  }
  assert.throws(() => assertManagedIamLogins({ ...BINDING.iamLogins, reader: 'reader@project.iam' }), {
    code: 'CONFIG_INVALID',
  });
});

test('managed session rejects unsafe identity or grants before SET ROLE', async () => {
  const invalidRows = [
    ['wrong database', identityRow('runtime', { database_name: 'other_database' })],
    ['wrong SESSION_USER', identityRow('runtime', { login_name: 'unexpected-login' })],
    ['unexpected active role', identityRow('runtime', { role_name: 'cloudsqliamuser' })],
    ['unsafe login flags', identityRow('runtime', { login_safe: false })],
    ['unsafe app role flags', identityRow('runtime', { app_role_safe: false })],
    ['unexpected role membership', identityRow('runtime', { roles_isolated: false })],
    ['database owner membership', identityRow('runtime', { not_database_owner: false })],
    ['sibling core privilege', identityRow('runtime', { no_sibling_core: false })],
  ];

  for (const [label, initialRow] of invalidRows) {
    const { client, calls } = sessionClient('runtime', { initialRow });
    await assert.rejects(prepareManagedDatabaseSession(client, BINDING, 'runtime'), {
      code: 'DB_BOUNDARY_INVALID',
    }, label);
    assert.equal(calls.length, 1, `${label} must be rejected before SET ROLE`);
  }

  for (const [label, initialRow] of [
    ['no login row', null],
    ['duplicate login rows', undefined],
  ]) {
    const options = initialRow === undefined
      ? { initialRows: [identityRow('runtime'), identityRow('runtime')] }
      : { initialRow };
    const { client, calls } = sessionClient('runtime', options);
    await assert.rejects(prepareManagedDatabaseSession(client, BINDING, 'runtime'), {
      code: 'DB_BOUNDARY_INVALID',
    }, label);
    assert.equal(calls.length, 1, `${label} must be rejected before SET ROLE`);
  }
});

test('managed session rejects a wrong role after SET ROLE and rejects unknown lifecycle purposes', async () => {
  const { client, calls } = sessionClient('runtime', {
    activeRow: { login_name: BINDING.iamLogins.runtime, role_name: 'cloudsqliamuser' },
  });
  await assert.rejects(prepareManagedDatabaseSession(client, BINDING, 'runtime'), {
    code: 'DB_BOUNDARY_INVALID',
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].text, `SET ROLE ${MANAGED_DATABASE.roles.runtime}`);

  await assert.rejects(prepareManagedDatabaseSession(sessionClient('runtime').client, BINDING, 'owner'), {
    code: 'CONFIG_INVALID',
  });
  assert.throws(() => managedJobConnectionOptions(urlFor('migrator'), BINDING, 'owner', JOB_TOKEN), {
    code: 'CONFIG_INVALID',
  });
});
