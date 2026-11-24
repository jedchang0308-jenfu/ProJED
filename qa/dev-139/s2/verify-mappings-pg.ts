import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import pg from 'pg';
import { createLocalJWKSet, exportJWK, SignJWT } from 'jose';
import { RuntimeDatabase } from '../../../server/db.js';
import type { RuntimeConfig } from '../../../server/config.js';
import { GooglePrincipalMappingResolver } from '../../../server/principalMappings.js';
import { TABLES, insertSnapshot, readSource, readTarget, snapshotId, snapshotTypes, validateSource } from '../../../scripts/dev139-data-migration.js';
import { createAppSessionService } from '../../../server/appSessionService.js';
import { IdentityConsumer, type ProducerVerifiedIdentity } from '../../../server/identityConsumer.js';
import { createPlatformHandoffClient, type PlatformHandoffBinding } from '../../../server/platformHandoff.js';
import { createPlatformIdentityVerifier } from '../../../server/platformIdentityVerifier.js';
import { createPlatformPrincipalStateReader, PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT } from '../../../server/platformPrincipalState.js';
import { PostgresAppSessionStore } from '../../../server/postgresAppSessionStore.js';
import { parseSessionCookie } from '../../../server/sessionCookies.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { createLegacyEntryRelay } from '../../../server/legacyEntryRelay.js';
import { createLegacyEntryRequestPreparer } from '../../../server/legacyEntryOrigin.js';
import { LEGACY_ENTRY_ACCOUNT, LEGACY_ENTRY_UPSTREAM, LEGACY_MAIN_ORIGIN, LEGACY_QUICK_ORIGIN, type LegacyEntryBinding } from '../../../server/legacyEntryBinding.js';
import { publishSyntheticPrincipalState } from './principalStateFixture.js';

export async function verifyGoogleMappingsPostgres(database: RuntimeDatabase): Promise<void> {
  const lease = await database.checkout();
  try {
    assert.equal((await lease.client.query('SELECT * FROM projed_core.google_identity_proofs')).rowCount, 0);
    const acl = (await lease.client.query<{ runtime_write: boolean; registration_insert: boolean; importer_update: boolean; forced: boolean }>(`
      SELECT has_table_privilege(current_user,'projed_core.google_identity_proofs','INSERT,UPDATE,DELETE') AS runtime_write,
             has_column_privilege(current_user,'projed_core.google_identity_proofs','google_subject','INSERT')
               AND has_column_privilege(current_user,'projed_core.google_identity_proofs','local_user_id','INSERT') AS registration_insert,
             has_table_privilege('projed_importer_disposable','projed_core.google_identity_proofs','UPDATE,DELETE') AS importer_update,
             (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
               WHERE oid='projed_core.google_identity_proofs'::regclass) AS forced
    `)).rows[0]!;
    assert.equal(acl.runtime_write, false);
    assert.equal(acl.registration_insert, true);
    assert.equal(acl.importer_update, false);
    assert.equal(acl.forced, true);
    await lease.client.query('BEGIN');
    await lease.client.query("SELECT set_config('projed.verified_google_subject','synthetic-google-a',true)");
    assert.equal((await lease.client.query("SELECT * FROM projed_core.google_identity_proofs WHERE google_subject='synthetic-google-b'")).rowCount, 0);
    await lease.client.query('ROLLBACK');
  } finally { lease.release(); }

  const resolver = new GooglePrincipalMappingResolver(database);
  const proof = {
    principalId: 'principal:a', identityIssuer: 'https://securetoken.google.com/local-test',
    identitySubject: 'firebase-a', googleSubject: 'synthetic-google-a', mappingRevision: '12',
  };
  const mapped = await resolver.resolve(proof);
  assert.deepEqual(mapped, {
    status: 'active', principalId: proof.principalId,
    identityIssuer: proof.identityIssuer, identitySubject: proof.identitySubject,
    googleSubject: proof.googleSubject,
    mappingRevision: '12', localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', accountGuardRevision: '1',
  });
  assert.deepEqual(await resolver.resolve({ ...proof, googleSubject: 'not-in-the-snapshot' }), { status: 'missing' });
  assert.deepEqual(await resolver.resolve({ ...proof, googleSubject: 'synthetic-google-no-guard' }), { status: 'inactive' });
  assert.deepEqual(await resolver.resolve({ ...proof, googleSubject: 'synthetic-google-inactive' }), { status: 'inactive' });
  const after = await database.checkout();
  try {
    assert.equal((await after.client.query('SELECT * FROM projed_core.google_identity_proofs')).rowCount, 0);
    assert.equal((await after.client.query('SELECT * FROM projed_core.account_authorization_guards')).rowCount, 0);
  } finally { after.release(); }
}

/** Real nonce PG, production five-domain projection/import/reconciliation and
 * host-bound HTTP login. Owner publication/exchange and Google signing keys are
 * synthetic; this is neither the full migration CLI nor provider qualification. */
export async function verifyLegacyEntryMappingSessionsPostgres(config: RuntimeConfig): Promise<void> {
  type Profile = { localUserId: string; entry: 'main' | 'quick'; authContextId: string };
  const json = async <T>(response: Response): Promise<T> => await response.json() as T;
  const errorCode = async (response: Response) => (await json<{ error: { code: string } }>(response)).error.code;
  assert.equal(config.env, 'disposable');
  const raw = process.env.PROJED_QA_MEETING_ADMIN_URL;
  assert.ok(raw);
  const url = new URL(raw), runtime = new URL(config.databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.hostname, runtime.hostname);
  assert.equal(url.port, String(config.binding.databasePort));
  assert.equal(url.pathname, runtime.pathname);
  assert.match(url.pathname, /^\/dev139_s3_[a-f0-9]{32}$/u);
  assert.equal(url.username, 'postgres');
  assert.ok(url.password && !url.search && !url.hash);
  const admin = new pg.Client({ connectionString: raw, types: snapshotTypes });
  const source = new pg.Client({ connectionString: raw, types: snapshotTypes });
  const target = new pg.Client({ connectionString: raw, types: snapshotTypes });
  const database = new RuntimeDatabase(config); // The kernel owns only this pool.
  let kernel: ReturnType<typeof createKernelHttpServer> | undefined;
  let relay: Server | undefined;
  let sourceCreated = false, privateCreated = false;
  const ownerId = randomUUID(), otherId = randomUUID(), nonce = randomUUID();
  const captureId = `task_workbench_unplaced_${nonce}`, title = `Imported legacy capture ${nonce}`;
  const titleHash = createHash('sha256').update(title).digest('hex');
  const legacyTime = '2026-01-01T00:00:00.000Z';
  const specs = TABLES.filter(spec => ['profiles', 'google_identity_proofs', 'account_authorization_guards',
    'unplaced_tasks', 'quick_task_capture_receipts'].includes(spec.target));
  assert.equal(specs.length, 5);
  const scope = (snapshot: Map<string, Record<string, unknown>[]>) => new Map([...snapshot].map(([name, rows]) => [name,
    rows.filter(row => ([ownerId, otherId] as readonly string[]).includes(String(row[name === 'profiles' ? 'id'
      : name === 'google_identity_proofs' || name === 'account_authorization_guards' ? 'local_user_id' : 'owner_id']))),
  ]));
  try {
    await admin.connect();
    const existing = (await admin.query<{ relation: string | null; private_exists: boolean }>(`
      SELECT to_regclass('public.profiles')::text AS relation,
             to_regnamespace('private') IS NOT NULL AS private_exists`)).rows[0]!;
    assert.equal(existing.relation, null, 'Never replace another source fixture');
    privateCreated = !existing.private_exists;
    // Plain source relations only. The target is populated exclusively by the
    // production importer below, under the existing importer role.
    await admin.query(`BEGIN;
      CREATE SCHEMA IF NOT EXISTS private;
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY, email text, display_name text, external_auth_provider text,
        external_auth_id text, ui_preferences jsonb, created_at timestamptz, updated_at timestamptz,
        qa_google_subject text NOT NULL);
      CREATE VIEW private.projed_dev139_google_identities_v1 AS
        SELECT id AS user_id,'google'::text AS provider,qa_google_subject AS provider_id,
               jsonb_build_object('sub',qa_google_subject) AS identity_data FROM public.profiles;
      CREATE VIEW private.projed_dev139_auth_users_v1 AS
        SELECT id,NULL::timestamptz AS banned_until,NULL::timestamptz AS deleted_at FROM public.profiles;
      CREATE TABLE public.task_workbench_unplaced_items (
        owner_id uuid,id text,workspace_id text,task jsonb,sort_order double precision,
        created_at timestamptz,updated_at timestamptz,PRIMARY KEY(owner_id,id));
      CREATE TABLE private.quick_task_capture_receipts (
        owner_id uuid,capture_id text,title_hash bytea,committed_at timestamptz,PRIMARY KEY(owner_id,capture_id));
      COMMIT;`);
    sourceCreated = true;
    for (const id of [ownerId, otherId]) {
      await admin.query(`INSERT INTO public.profiles VALUES($1::uuid,$2,'Legacy user',NULL,NULL,'{}',
        $3::timestamptz,$3::timestamptz,$4)`, [id, `${id}@example.invalid`, legacyTime, `legacy-google-${id}`]);
    }
    const task = { id: captureId, workspaceId: 'legacy-session-fixture', title, status: 'todo',
      nodeType: 'task', boardId: '__task_workbench_unplaced__', parentId: null, order: 0,
      createdAt: Date.parse(legacyTime), updatedAt: Date.parse(legacyTime), detailNotes: [] };
    await admin.query(`INSERT INTO public.task_workbench_unplaced_items VALUES($1::uuid,$2,
      'legacy-session-fixture',$3::jsonb,0,$4::timestamptz,$4::timestamptz)`, [ownerId, captureId, JSON.stringify(task), legacyTime]);
    await admin.query(`INSERT INTO private.quick_task_capture_receipts VALUES($1::uuid,$2,decode($3,'hex'),$4::timestamptz)`,
      [ownerId, captureId, titleHash, legacyTime]);
    await Promise.all([source.connect(), target.connect()]);
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await validateSource(source);
    const snapshot = await readSource(source, specs);
    assert.deepEqual([...snapshot].map(([name, rows]) => [name, rows.length]), [
      ['profiles', 2], ['google_identity_proofs', 2], ['account_authorization_guards', 2],
      ['unplaced_tasks', 1], ['quick_task_capture_receipts', 1],
    ]);
    await target.query('SET ROLE projed_importer_disposable');
    assert.equal((await target.query('SELECT current_user AS role')).rows[0].role, config.profile.roles.importer);
    await target.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    assert.ok([...scope(await readTarget(target, specs)).values()].every(rows => rows.length === 0));
    await insertSnapshot(target, snapshot, specs);
    assert.equal(snapshotId(scope(await readTarget(target, specs))), snapshotId(snapshot));
    await target.query('COMMIT');
    await source.query('ROLLBACK');

    const brokerOrigin = 'https://platform.example.invalid';
    const identityBinding: PlatformHandoffBinding = { contractVersion: 'jenfu.sso-handoff.v4',
      issuer: `${brokerOrigin}/api/sso`, manifestSha256: 'c'.repeat(64), audience: 'projed' };
    const proofs = new Map<string, ProducerVerifiedIdentity>();
    for (const id of [ownerId, otherId]) {
      const now = Date.now();
      const identity: ProducerVerifiedIdentity = { ...identityBinding, identityIssuer: 'https://accounts.google.com',
        identitySubject: `legacy-google-${id}`, googleSubject: `legacy-google-${id}`, principalId: `legacy-principal-${id}`,
        principalKind: 'personal', employeeId: null, verifiedEmail: `${id}@example.invalid`, authEpoch: 1,
        authenticatedAtMs: now - 60_000, revokedBeforeMs: null, sourceSessionExpiresAtMs: now + 3600_000,
        issuedAtMs: now - 1_000, expiresAtMs: now + 59_000, currentStateExpiresAtMs: now + 10_000, mappingRevision: '1' };
      proofs.set(id, identity);
      await publishSyntheticPrincipalState(config, identity);
    }
    const codes = new Map<string, { identity: ProducerVerifiedIdentity; callback: string; challenge: string }>();
    let exchanges = 0;
    const handoffs = createPlatformHandoffClient({ environment: 'production', brokerOrigin, binding: identityBinding,
      callbacks: { main: `${LEGACY_MAIN_ORIGIN}/api/auth/jenfu-sso/callback`, quick: `${LEGACY_QUICK_ORIGIN}/api/auth/jenfu-sso/callback` },
      tokenProvider: async audience => { assert.equal(audience, brokerOrigin); return 'SYNTHETIC.owner-service-proof'; },
      fetchImpl: async (input, init) => {
        assert.equal(String(input), `${brokerOrigin}/api/sso/token`);
        assert.equal(init?.redirect, 'error');
        const form = new URLSearchParams(String(init?.body));
        const code = form.get('code')!, expected = codes.get(code);
        assert.ok(expected, 'Owner code is single-use'); codes.delete(code); exchanges++;
        assert.equal(form.get('redirect_uri'), expected.callback);
        assert.equal(createHash('sha256').update(form.get('code_verifier')!, 'ascii').digest('base64url'), expected.challenge);
        const identity = expected.identity, now = Date.now();
        return Response.json({ contractVersion: identity.contractVersion, issuer: identity.issuer, audience: 'projed',
          identity: { identityIssuer: identity.identityIssuer, identitySubject: identity.identitySubject,
            principalId: identity.principalId, principalKind: identity.principalKind, employeeId: null, googleSubject: identity.googleSubject },
          authentication: { authenticatedAt: new Date(identity.authenticatedAtMs).toISOString(), email: identity.verifiedEmail,
            emailVerified: true, signInProvider: 'google.com', secondFactor: null, assuranceLevel: 'aal1' },
          authState: { authEpoch: 1, revokedBefore: null }, mappingRevision: '1',
          sourceSessionExpiresAt: new Date(identity.sourceSessionExpiresAtMs).toISOString(),
          // Existing synthetic SQL reads deliberately trail UTC by 100 ms.
          // Issue before that read; retain the real wire's exact 60-second cap.
          issuedAt: new Date(now - 1_000).toISOString(), expiresAt: new Date(now + 59_000).toISOString() });
      } });
    const states = createPlatformPrincipalStateReader({ contractBinding: PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT,
      handoffBinding: identityBinding, environment: 'production', query: { async query(sql, values) {
        const lease = await database.checkout();
        try { return { rows: (await lease.client.query(sql, [...values])).rows }; }
        finally { lease.release(); }
      } } });
    const mappings = new GooglePrincipalMappingResolver(database), store = new PostgresAppSessionStore(database);
    const consumer = new IdentityConsumer({ pins: [identityBinding], mappings,
      verifier: createPlatformIdentityVerifier({ handoffs, stateReader: states, binding: identityBinding, environment: 'production' }) });
    const auth = createAppSessionService({ store, consumer, mappings, binding: identityBinding, pins: [identityBinding],
      origins: { main: LEGACY_MAIN_ORIGIN, quick: LEGACY_QUICK_ORIGIN }, environment: 'production' });
    const transport: LegacyEntryBinding = { version: 'projed.legacy-entry.v1', upstreamOrigin: LEGACY_ENTRY_UPSTREAM,
      serviceAccount: LEGACY_ENTRY_ACCOUNT, serviceAccountSubject: '123456789012345678901', qualificationSha256: 'b'.repeat(64) };
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = await exportJWK(keys.publicKey), nowSeconds = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ email: transport.serviceAccount, email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'isolated-pg-relay' }).setIssuer('https://accounts.google.com')
      .setAudience(transport.upstreamOrigin).setSubject(transport.serviceAccountSubject)
      .setIssuedAt(nowSeconds).setExpirationTime(nowSeconds + 600).sign(keys.privateKey);
    kernel = createKernelHttpServer({ ...config, host: '127.0.0.1', port: 0 }, database, [], {
      prepareLegacyEntry: createLegacyEntryRequestPreparer(transport, {
        getKey: createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256', kid: 'isolated-pg-relay' }] }) }),
      dispatchAuth: auth.dispatchAuth, resolveActor: auth.resolveActor, resolveSessionInfo: auth.resolveSessionInfo,
      resolveLogoutIdentity: auth.resolveLogoutIdentity, destroySession: auth.destroySession,
    });
    const central = await kernel.listen();
    relay = createLegacyEntryRelay(transport, { getIdentityToken: async () => token, fetchImpl: async (input, init) => {
      const targetUrl = new URL(String(input)); assert.equal(targetUrl.origin, transport.upstreamOrigin);
      return fetch(`http://${central.host}:${central.port}${targetUrl.pathname}${targetUrl.search}`, init);
    } });
    await new Promise<void>((resolve, reject) => { relay!.once('error', reject); relay!.listen(0, '127.0.0.1', resolve); });
    const address = relay.address(); assert.ok(address && typeof address !== 'string');
    console.log(JSON.stringify({ scope: 'SYNTHETIC_OWNER_REAL_PG_LEGACY_RELAY', pid: process.pid,
      centralPort: central.port, relayPort: address.port }));
    const request = (publicOrigin: string, path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...init, redirect: 'manual', headers: { 'x-forwarded-host': new URL(publicOrigin).host, origin: publicOrigin,
        ...Object.fromEntries(new Headers(init.headers)) },
    });
    const cookie = (response: Response) => {
      const value = response.headers.get('set-cookie'); assert.ok(value);
      assert.match(value, /; Path=\/;/u); assert.match(value, /; Secure;/u); assert.match(value, /; HttpOnly;/u);
      assert.ok(!/;\s*Domain=/iu.test(value)); return value.split(';', 1)[0]!;
    };
    const login = async (publicOrigin: string, entry: 'main' | 'quick', id: string) => {
      const start = await request(publicOrigin, '/api/v1/session/login', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry, returnPath: entry === 'main' ? '/' : '/quick-task/' }) });
      assert.equal(start.status, 200);
      const authorize = new URL((await json<{ data: { authorizationUrl: string } }>(start)).data.authorizationUrl), pending = cookie(start);
      assert.equal(authorize.origin, brokerOrigin);
      assert.equal(authorize.searchParams.get('redirect_uri'), `${publicOrigin}/api/auth/jenfu-sso/callback`);
      const code = randomBytes(32).toString('base64url');
      codes.set(code, { identity: proofs.get(id)!, callback: authorize.searchParams.get('redirect_uri')!,
        challenge: authorize.searchParams.get('code_challenge')! });
      const callback = '/api/auth/jenfu-sso/callback?' + new URLSearchParams({ code, state: authorize.searchParams.get('state')!, iss: identityBinding.issuer });
      const loginToken = parseSessionCookie({ headers: { cookie: pending } }).loginToken; assert.ok(loginToken);
      const loginHash = createHash('sha256').update(loginToken).digest('hex');
      const before = await store.readLogin(loginHash); assert.equal(before?.status, 'pending');
      const priorExchanges = exchanges;
      // A pending nonce from one old host must not complete on the other host.
      const wrong = await request(publicOrigin === LEGACY_MAIN_ORIGIN ? LEGACY_QUICK_ORIGIN : LEGACY_MAIN_ORIGIN,
        callback, { headers: { cookie: pending } });
      assert.equal(wrong.status, 401); assert.equal(await errorCode(wrong), 'IDENTITY_INVALID');
      assert.equal(wrong.headers.get('set-cookie'), null);
      const after = await store.readLogin(loginHash);
      assert.equal(after?.status, 'pending'); assert.equal(after.claimHash, null); assert.equal(after.completedSessionHash, null);
      assert.equal(after.codeVerifier === before.codeVerifier, true, 'Wrong host must not consume or replace the pending verifier');
      assert.equal(exchanges, priorExchanges); assert.ok(codes.has(code));
      const completed = await request(publicOrigin, callback, { headers: { cookie: pending } });
      if (completed.status !== 303) assert.fail(JSON.stringify({ stage: 'legacy-host-callback', http: completed.status,
        errorCode: await errorCode(completed), exchanges, intentStatus: (await store.readLogin(loginHash))?.status }));
      assert.equal(completed.status, 303);
      assert.equal(completed.headers.get('location'), `${publicOrigin}${entry === 'main' ? '/' : '/quick-task/'}`);
      const sessionCookie = cookie(completed); await completed.arrayBuffer();
      const info = await request(publicOrigin, '/api/v1/session', { headers: { cookie: sessionCookie } });
      assert.equal(info.status, 200); const profile = (await json<{ data: Profile }>(info)).data;
      assert.equal(profile.localUserId, id); assert.equal(profile.entry, entry);
      const persisted = await store.readSession(createHash('sha256').update(sessionCookie.slice('__session='.length)).digest('hex'));
      assert.equal(persisted?.localUserId, id); assert.equal(persisted.publicOrigin, publicOrigin);
      assert.equal(persisted.contextId, profile.authContextId);
      return { cookie: sessionCookie, profile };
    };
    const main = await login(LEGACY_MAIN_ORIGIN, 'main', ownerId);
    const quick = await login(LEGACY_QUICK_ORIGIN, 'quick', ownerId);
    const other = await login(LEGACY_MAIN_ORIGIN, 'main', otherId);
    assert.notEqual(main.cookie, quick.cookie); assert.notEqual(main.profile.authContextId, quick.profile.authContextId);
    for (const [publicOrigin, sessionCookie] of [[LEGACY_MAIN_ORIGIN, quick.cookie], [LEGACY_QUICK_ORIGIN, main.cookie]]) {
      const wrong = await request(publicOrigin!, '/api/v1/session', { headers: { cookie: sessionCookie! } });
      assert.equal(wrong.status, 401); await wrong.arrayBuffer();
    }
    for (const [publicOrigin, session] of [[LEGACY_MAIN_ORIGIN, main], [LEGACY_QUICK_ORIGIN, quick]] as const) {
      const replay = await request(publicOrigin, '/api/v1/quick-tasks', { method: 'POST', headers: {
        cookie: session.cookie, 'content-type': 'application/json', 'x-projed-expected-account-id': ownerId,
        'x-projed-expected-context-id': session.profile.authContextId }, body: JSON.stringify({ captureId, title, workspaceHint: null }) });
      assert.equal(replay.status, 200);
      assert.deepEqual((await json<{ data: unknown }>(replay)).data, { status: 'committed', captureId, ownerId, titleHash,
        created: false, committedAt: Date.parse(legacyTime) });
    }
    const othersItems = await request(LEGACY_MAIN_ORIGIN, '/api/v1/task-workbench/unplaced', { headers: {
      cookie: other.cookie, 'x-projed-expected-account-id': otherId, 'x-projed-expected-context-id': other.profile.authContextId } });
    assert.equal(othersItems.status, 200); assert.ok(!JSON.stringify(await othersItems.json()).includes(captureId));
    const ownItems = await request(LEGACY_MAIN_ORIGIN, '/api/v1/task-workbench/unplaced', { headers: {
      cookie: main.cookie, 'x-projed-expected-account-id': ownerId, 'x-projed-expected-context-id': main.profile.authContextId } });
    assert.equal(ownItems.status, 200);
    const ownBody = JSON.stringify(await ownItems.json()); assert.ok(ownBody.includes(captureId) && ownBody.includes(title));
    const otherReplay = await request(LEGACY_MAIN_ORIGIN, '/api/v1/quick-tasks', { method: 'POST', headers: {
      cookie: other.cookie, 'content-type': 'application/json', 'x-projed-expected-account-id': otherId,
      'x-projed-expected-context-id': other.profile.authContextId }, body: JSON.stringify({ captureId, title, workspaceHint: null }) });
    assert.equal(otherReplay.status, 422, 'Another account cannot observe the imported receipt or create without a workspace');
    assert.equal(await errorCode(otherReplay), 'QUICK_TASK_NO_AVAILABLE_WORKSPACE');
    const counts = (await admin.query(`SELECT
      (SELECT count(*)::int FROM projed_core.profiles WHERE id=ANY($1::uuid[])) AS profiles,
      (SELECT count(*)::int FROM projed_core.unplaced_tasks WHERE legacy_task_id=$2) AS tasks,
      (SELECT count(*)::int FROM projed_core.quick_task_capture_receipts WHERE capture_id=$2) AS receipts`,
    [[ownerId, otherId], captureId])).rows[0];
    assert.deepEqual(counts, { profiles: 2, tasks: 1, receipts: 1 });
    assert.equal(exchanges, 3); assert.equal(codes.size, 0);
    await admin.query('BEGIN; SET LOCAL ROLE projed_owner_disposable');
    await admin.query('SELECT projed_contract.invalidate_google_sessions_v1($1::text)', [`legacy-google-${ownerId}`]);
    await admin.query('COMMIT');
    for (const [publicOrigin, session] of [[LEGACY_MAIN_ORIGIN, main], [LEGACY_QUICK_ORIGIN, quick]] as const) {
      const revoked = await request(publicOrigin, '/api/v1/session', { headers: { cookie: session.cookie } });
      assert.equal(revoked.status, 409); assert.equal(revoked.headers.get('cache-control'), 'no-store');
      assert.equal(await errorCode(revoked), 'IDENTITY_MAPPING_CONFLICT');
      const revokedWrite = await request(publicOrigin, '/api/v1/quick-tasks', { method: 'POST', headers: {
        cookie: session.cookie, 'content-type': 'application/json', 'x-projed-expected-account-id': ownerId,
        'x-projed-expected-context-id': session.profile.authContextId }, body: JSON.stringify({ captureId, title, workspaceHint: null }) });
      assert.equal(revokedWrite.status, 409); assert.equal(await errorCode(revokedWrite), 'IDENTITY_MAPPING_CONFLICT');
    }
    assert.equal(exchanges, 3, 'Session reads/revocation must not exchange another owner code');
  } finally {
    if (relay?.listening) await new Promise<void>((resolve, reject) => {
      relay!.close(error => error ? reject(error) : resolve()); relay!.closeAllConnections();
    });
    if (kernel?.server.listening) await kernel.shutdown(); else await database.end();
    assert.ok(!relay?.listening && !kernel?.server.listening, 'Owned HTTP listeners must close');
    await source.query('ROLLBACK').catch(() => undefined); await target.query('ROLLBACK').catch(() => undefined);
    await admin.query('ROLLBACK').catch(() => undefined);
    await Promise.all([source.end(), target.end()]);
    try {
      if (sourceCreated) {
        await admin.query(`DROP VIEW private.projed_dev139_google_identities_v1,private.projed_dev139_auth_users_v1;
          DROP TABLE public.profiles,public.task_workbench_unplaced_items,private.quick_task_capture_receipts;`);
        if (privateCreated) await admin.query('DROP SCHEMA private');
      }
    } finally { await admin.end(); }
  }
}
