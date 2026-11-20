import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { CollaborationWriteRepository } from '../../../server/collaborationWrite.js';
import { sha256, type RuntimeConfig } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { DomainReadRepository } from '../../../server/domainRead.js';
import { KernelError } from '../../../server/errors.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { PostgresAppSessionStore } from '../../../server/postgresAppSessionStore.js';
import { createHttpCollaborationAdapter } from '../../../src/services/httpApi/collaborationAdapter.js';
import { createHttpDomainReadAdapter } from '../../../src/services/httpApi/domainReadAdapter.js';
import { HttpApiClient, HttpApiError } from '../../../src/services/httpApi/httpApiClient.js';
import { startBrowserFixtureSession } from '../s2/verify-app-sessions-pg.js';

/** Same nonce PostgreSQL as S3; owns its HTTP/pool, workspaces and bound Sessions. */
export async function verifyBoundBoardTransferPostgres(config: RuntimeConfig): Promise<void> {
  assert.equal(config.profile.environment, 'disposable');
  const database = new RuntimeDatabase(config);
  const reads = new DomainReadRepository();
  const commands = new CollaborationWriteRepository(reads);
  const sessions = new PostgresAppSessionStore(database);
  const ownedSessions: Array<{ hash: string; publicOrigin: string; actor: ServerActorV1 }> = [];
  const actors = new Map<string, ServerActorV1>();
  const ownedWorkspaces: string[] = [];
  const workspaceCreators = new Map<string, 'owner' | 'employeeCollaborator'>();
  const failures: unknown[] = [];
  const observations: Array<{ name: string; status: 'PASS' | 'FAIL'; httpStatus?: number; code?: string }> = [];
  const wire: Array<{ method: string; status: number }> = [];
  const receiptPath = resolve('output/qa/dev-139/bound-board-transfer', randomUUID(), 'result.json');
  const http = createKernelHttpServer({ ...config, host: '127.0.0.1', port: 0 }, database,
    config.profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) })), {
      resolveActor: async request => {
        const actor = actors.get(request.headers.cookie ?? '');
        if (!actor) throw new KernelError('ACTOR_INVALID', 'Bound transfer fixture Session unavailable', 401);
        return actor;
      },
    });
  const newSession = async (identity: 'owner' | 'employeeCollaborator' = 'owner') => {
    const actor = await startBrowserFixtureSession(database, config, identity);
    assert.ok(actor.sessionTokenHash);
    const stored = await sessions.readSession(actor.sessionTokenHash);
    assert.ok(stored);
    ownedSessions.push({ hash: actor.sessionTokenHash, publicOrigin: stored.publicOrigin, actor });
    return actor;
  };
  const observe = async (name: string, verify: () => Promise<void>) => {
    try {
      await verify();
      observations.push({ name, status: 'PASS' });
    } catch (error) {
      failures.push(error);
      observations.push({ name, status: 'FAIL', ...(error instanceof HttpApiError
        ? { httpStatus: error.status, code: error.code } : {}) });
    }
  };
  let cleanupComplete = false;
  try {
    const original = await newSession();
    actors.set('fixture-bound-transfer=original', original);
    const address = await http.listen();
    const origin = `http://${address.host}:${address.port}`;
    const clientFor = (actor: ServerActorV1, cookie: string) => {
      const client = new HttpApiClient(async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('cookie', cookie);
        headers.set('origin', origin);
        const response = await fetch(`${origin}${String(input)}`, { ...init, headers });
        wire.push({ method: init?.method ?? 'GET', status: response.status });
        return response;
      });
      client.bindExpectedActor({ accountId: actor.localUserId, contextId: actor.contextId });
      return client;
    };
    const originalClient = clientFor(original, 'fixture-bound-transfer=original');
    const collaboration = createHttpCollaborationAdapter(originalClient);
    const originalReads = createHttpDomainReadAdapter(originalClient);
    const source = await collaboration.createWorkspace('Bound Session transfer source');
    ownedWorkspaces.push(source.id);
    const target = await collaboration.createWorkspace('Bound Session transfer target');
    ownedWorkspaces.push(target.id);
    const board = await collaboration.createBoard(source.id, 'Bound Session empty board');
    const peer = await newSession();
    assert.deepEqual(await originalReads.listTasks(source.id, board.id), []);
    assert.equal((await originalReads.getCurrentBoardAccess(source.id, board.id)).capabilities.includes('read_board'), true);
    const preview = await collaboration.previewBoardTransfer(source.id, board.id, target.id);
    assert.equal(preview.blocked, false);
    await collaboration.moveBoardToWorkspace(source.id, board.id, target.id, board.title);
    observations.push({ name: 'original-bound-session-http-transfer', status: 'PASS' });

    // Collect these independently: a missing old-Session read must not hide
    // whether a fresh login restores the same Board or another scope leaks.
    await observe('original-session-can-read-same-board-after-transfer', async () => {
      assert.deepEqual(await originalReads.listTasks(target.id, board.id), []);
      const access = await originalReads.getCurrentBoardAccess(target.id, board.id);
      assert.equal(access.workspaceId, target.id);
      assert.equal(access.boardId, board.id);
      assert.equal(access.capabilities.includes('read_board'), true);
      const index = await originalReads.listWorkspaces();
      assert.equal(index.find(workspace => workspace.id === target.id)?.boards.some(item => item.id === board.id), true);
    });
    const rejectOutsideBoard = async (reader: ReturnType<typeof createHttpDomainReadAdapter>) => {
      // Existing A-owned fixture is read only; this test never modifies it.
      await assert.rejects(reader.listTasks('ws-a', 'board-a'),
        (error: unknown) => error instanceof HttpApiError && error.status === 404 && error.code === 'RESOURCE_NOT_FOUND');
    };
    await observe('original-session-still-denies-other-account-board', () => rejectOutsideBoard(originalReads));
    await observe('other-pre-transfer-session-is-revoked', async () => {
      const stored = await sessions.readSession(peer.sessionTokenHash!);
      assert.equal(stored !== null && stored.revokedAtMs !== null, true);
      await assert.rejects(runActorTransaction(database, config, peer, async () => undefined),
        (error: unknown) => error instanceof KernelError && error.code === 'ACCESS_DENIED');
    });
    const fresh = await newSession();
    assert.notEqual(fresh.contextId, original.contextId);
    assert.equal(fresh.localUserId, original.localUserId);
    actors.set('fixture-bound-transfer=fresh', fresh);
    const freshReads = createHttpDomainReadAdapter(clientFor(fresh, 'fixture-bound-transfer=fresh'));
    await observe('fresh-login-can-read-same-board-in-target', async () => {
      assert.deepEqual(await freshReads.listTasks(target.id, board.id), []);
      const access = await freshReads.getCurrentBoardAccess(target.id, board.id);
      assert.equal(access.workspaceId, target.id);
      assert.equal(access.boardId, board.id);
      assert.equal(access.capabilities.includes('read_board'), true);
    });
    await observe('fresh-session-still-denies-other-account-board', () => rejectOutsideBoard(freshReads));
    await observe('source-no-longer-resolves-the-moved-board', async () => {
      await assert.rejects(freshReads.listTasks(source.id, board.id),
        (error: unknown) => error instanceof HttpApiError && error.status === 404 && error.code === 'RESOURCE_NOT_FOUND');
    });
    await observe('postgres-preserves-one-empty-board-under-target', async () => {
      const state = await runActorTransaction(database, config, fresh, async port => {
        const result = await port.query<{ workspace: string; boards: string; tasks: string }>(`
          SELECT tenant.legacy_workspace_id AS workspace, count(DISTINCT project.id)::text AS boards,
                 count(item.id)::text AS tasks
            FROM projed_core.projects project
            JOIN projed_core.tenants tenant ON tenant.id=project.tenant_id
            LEFT JOIN projed_core.wbs_items item ON item.tenant_id=project.tenant_id AND item.project_id=project.id
           WHERE project.legacy_board_id=$1 AND tenant.legacy_workspace_id=$2
           GROUP BY tenant.legacy_workspace_id`, [board.id, target.id]);
        return result.rows;
      });
      assert.deepEqual(state, [{ workspace: target.id, boards: '1', tasks: '0' }]);
    });

    // Additional membership is fixture setup only. It is restricted to this
    // nonce database and these new workspaces; all tested moves use real HTTP.
    const adminUrl = new URL(process.env.PROJED_QA_MEETING_ADMIN_URL ?? 'invalid:');
    const runtimeUrl = new URL(config.databaseUrl);
    assert.equal(adminUrl.protocol === 'postgresql:' && adminUrl.hostname === '127.0.0.1'
      && adminUrl.username === 'postgres' && adminUrl.port === runtimeUrl.port
      && adminUrl.pathname === runtimeUrl.pathname && /^\/dev139_s3_[0-9a-f]{32}$/u.test(adminUrl.pathname), true,
    'bound transfer fixture admin must match its existing nonce database');
    const admin = new pg.Client({ connectionString: adminUrl.toString(), application_name: 'dev139-bound-transfer-role-fixture' });
    await admin.connect();
    const memberUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const boundGrant = (actor: ServerActorV1, boardId: string) => runActorTransaction(database, config, actor, async port => {
      const result = await port.query<{ grant: Record<string, unknown> }>(`
        SELECT current_setting('projed.session_permissions')::jsonb->'boards'->$1::text AS grant`, [boardId]);
      return result.rows[0]!.grant;
    });
    try {
      const adminIdentity = await admin.query<{ valid: boolean }>(`
        SELECT current_database()=$1 AND session_user='postgres' AND inet_server_addr()='127.0.0.1'::inet AS valid`,
      [adminUrl.pathname.slice(1)]);
      assert.equal(adminIdentity.rows[0]?.valid, true, 'fixture admin runtime identity mismatch');
      await admin.query(`INSERT INTO projed_core.tenant_members(tenant_id,user_id,role,status,member_email,member_display_name)
        VALUES ($1::uuid,$3::uuid,'viewer','active','a@example.invalid','A'),
               ($2::uuid,$3::uuid,'admin','active','a@example.invalid','A')`, [source.id, target.id, memberUserId]);
      await admin.query(`INSERT INTO projed_core.actor_scope_access(local_user_id,tenant_id,project_id,active,scope_revision)
        VALUES ($3::uuid,$1::uuid,NULL,true,1),($3::uuid,$2::uuid,NULL,true,1)`, [source.id, target.id, memberUserId]);

      await observe('explicit-role-without-inheritance-preserves-only-original-board-authority', async () => {
        const directBoard = await collaboration.createBoard(source.id, 'Direct member transfer');
        const matrix = await originalReads.getBoardRolePermissions(source.id, directBoard.id);
        await collaboration.updateRolePermissions(source.id, directBoard.id,
          { ...matrix, member: [...matrix.member, 'move_board_between_workspaces'] });
        await collaboration.upsertBoardMember(source.id, directBoard.id, memberUserId, 'member');
        const direct = await newSession('employeeCollaborator');
        actors.set('fixture-bound-transfer=direct', direct);
        const directClient = clientFor(direct, 'fixture-bound-transfer=direct');
        const directReads = createHttpDomainReadAdapter(directClient);
        const directCommands = createHttpCollaborationAdapter(directClient);
        const before = await boundGrant(direct, directBoard.id);
        assert.equal(before.role, 'member');
        assert.equal(before.inheritedRole, null);
        assert.equal(Array.isArray(before.capabilities) && before.capabilities.includes('configure_permissions'), false);
        await directCommands.moveBoardToWorkspace(source.id, directBoard.id, target.id, directBoard.title);
        assert.deepEqual(await directReads.listTasks(target.id, directBoard.id), []);
        assert.deepEqual(await boundGrant(direct, directBoard.id), { ...before, workspaceId: target.id });
        assert.equal((await directReads.getCurrentBoardAccess(target.id, directBoard.id)).canConfigureRolePermissions, false);
        await assert.rejects(directReads.listTasks('ws-b', 'board-private'),
          (error: unknown) => error instanceof HttpApiError && error.status === 404 && error.code === 'RESOURCE_NOT_FOUND');
      });

      await observe('inherited-only-owner-retains-the-same-role-source', async () => {
        // The preceding member-initiated move correctly revoked the earlier
        // owner's separate Session. Fixture creation must use a fresh login.
        const preparer = await newSession();
        actors.set('fixture-bound-transfer=preparer', preparer);
        const preparation = createHttpCollaborationAdapter(clientFor(preparer, 'fixture-bound-transfer=preparer'));
        const inheritedBoard = await preparation.createBoard(source.id, 'Inherited owner transfer');
        const removed = await admin.query(`DELETE FROM projed_core.project_members
          WHERE tenant_id=$1::uuid AND project_id=$2::uuid AND user_id=$3::uuid`, [source.id, inheritedBoard.id, original.localUserId]);
        assert.equal(removed.rowCount, 1);
        const inherited = await newSession();
        actors.set('fixture-bound-transfer=inherited', inherited);
        const inheritedClient = clientFor(inherited, 'fixture-bound-transfer=inherited');
        const inheritedReads = createHttpDomainReadAdapter(inheritedClient);
        const inheritedCommands = createHttpCollaborationAdapter(inheritedClient);
        const before = await boundGrant(inherited, inheritedBoard.id);
        assert.equal(before.role, null);
        assert.equal(before.inheritedRole, 'owner');
        await inheritedCommands.moveBoardToWorkspace(source.id, inheritedBoard.id, target.id, inheritedBoard.title);
        assert.deepEqual(await inheritedReads.listTasks(target.id, inheritedBoard.id), []);
        assert.deepEqual(await boundGrant(inherited, inheritedBoard.id), { ...before, workspaceId: target.id });
        await rejectOutsideBoard(inheritedReads);
      });

      await observe('changed-inheritance-does-not-carry-source-owner-authority', async () => {
        const preparer = await newSession('employeeCollaborator');
        actors.set('fixture-bound-transfer=reduced-preparer', preparer);
        const preparationClient = clientFor(preparer, 'fixture-bound-transfer=reduced-preparer');
        const preparation = createHttpCollaborationAdapter(preparationClient);
        const preparationReads = createHttpDomainReadAdapter(preparationClient);
        const ownedSource = await preparation.createWorkspace('Owner inheritance loss source');
        ownedWorkspaces.push(ownedSource.id);
        workspaceCreators.set(ownedSource.id, 'employeeCollaborator');
        const reducedBoard = await preparation.createBoard(ownedSource.id, 'Owner inheritance must not follow');
        const matrix = await preparationReads.getBoardRolePermissions(ownedSource.id, reducedBoard.id);
        await preparation.updateRolePermissions(ownedSource.id, reducedBoard.id, { ...matrix, admin: [] });
        const removed = await admin.query(`DELETE FROM projed_core.project_members
          WHERE tenant_id=$1::uuid AND project_id=$2::uuid AND user_id=$3::uuid`, [ownedSource.id, reducedBoard.id, memberUserId]);
        assert.equal(removed.rowCount, 1);
        const reduced = await newSession('employeeCollaborator');
        actors.set('fixture-bound-transfer=reduced', reduced);
        const reducedClient = clientFor(reduced, 'fixture-bound-transfer=reduced');
        const reducedCommands = createHttpCollaborationAdapter(reducedClient);
        const reducedReads = createHttpDomainReadAdapter(reducedClient);
        const before = await boundGrant(reduced, reducedBoard.id);
        assert.equal(before.role, null);
        assert.equal(before.inheritedRole, 'owner');
        await reducedCommands.moveBoardToWorkspace(ownedSource.id, reducedBoard.id, target.id, reducedBoard.title);
        const stored = await sessions.readSession(reduced.sessionTokenHash!);
        assert.equal(stored !== null && stored.revokedAtMs !== null, true, 'reduced inheritance kept the old Session valid');
        await assert.rejects(reducedReads.listTasks(target.id, reducedBoard.id),
          (error: unknown) => error instanceof HttpApiError && error.status === 403 && error.code === 'ACCESS_DENIED');
        const freshMember = await newSession('employeeCollaborator');
        actors.set('fixture-bound-transfer=reduced-fresh', freshMember);
        const freshMemberReads = createHttpDomainReadAdapter(clientFor(freshMember, 'fixture-bound-transfer=reduced-fresh'));
        await assert.rejects(freshMemberReads.listTasks(target.id, reducedBoard.id),
          (error: unknown) => error instanceof HttpApiError && error.status === 404 && error.code === 'RESOURCE_NOT_FOUND');
        const targetOwner = await newSession();
        actors.set('fixture-bound-transfer=target-owner', targetOwner);
        const targetOwnerReads = createHttpDomainReadAdapter(clientFor(targetOwner, 'fixture-bound-transfer=target-owner'));
        assert.deepEqual(await targetOwnerReads.listTasks(target.id, reducedBoard.id), []);
      });
    } finally { await admin.end(); }
  } catch (error) {
    failures.push(error);
    observations.push({ name: 'setup-or-transfer', status: 'FAIL', ...(error instanceof HttpApiError
      ? { httpStatus: error.status, code: error.code } : {}) });
  } finally {
    try {
      // Deleting a workspace may revoke its owner's Session. Each cleanup gets
      // a fresh, real owner snapshot instead of bypassing the runtime policy.
      for (const workspaceId of [...ownedWorkspaces].reverse()) {
        await observe('cleanup-owned-workspace', async () => {
          const cleanupActor = await newSession(workspaceCreators.get(workspaceId) ?? 'owner');
          await runActorTransaction(database, config, cleanupActor,
            port => commands.deleteWorkspace(port, workspaceId));
        });
      }
      for (const session of ownedSessions) {
        await observe('cleanup-owned-session', async () => {
          await sessions.revokeSession(session.hash, session.publicOrigin, Date.now());
          // readSession deliberately returns revoked rows; only the resolver
          // decides validity. Never compare/log the full stored Session row.
          const stored = await sessions.readSession(session.hash);
          assert.equal(stored !== null && stored.revokedAtMs !== null && Number.isFinite(stored.revokedAtMs), true,
            'owned Session was not marked revoked');
          await assert.rejects(runActorTransaction(database, config, session.actor, async () => undefined),
            (error: unknown) => error instanceof KernelError && error.code === 'ACCESS_DENIED');
        });
      }
      cleanupComplete = observations.filter(item => item.name.startsWith('cleanup-owned-'))
        .every(item => item.status === 'PASS');
    } catch (error) {
      cleanupComplete = false;
      failures.push(error);
      observations.push({ name: 'cleanup-owned-sessions', status: 'FAIL' });
    } finally {
      await http.shutdown();
      mkdirSync(dirname(receiptPath), { recursive: true });
      writeFileSync(receiptPath, JSON.stringify({
        status: failures.length ? 'FAIL' : 'PASS',
        evidenceLevel: 'BOUND_PERSISTED_SESSION_REAL_HTTP_POSTGRES_BOARD_TRANSFER',
        identityProof: 'SYNTHETIC_FIXTURE_REAL_APP_SESSION_STORE',
        sourceRevision: process.env.GITHUB_SHA ?? null,
        expectedOriginalSessionContinuity: true,
        freshLoginIsDiagnosticOnly: true,
        observations, wire, cleanupComplete,
        production: 'NOT_RUN', provider: 'NOT_REQUESTED',
      }, null, 2) + '\n');
      console.log(`DEV139_BOUND_BOARD_TRANSFER_RECEIPT=${receiptPath}`);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Bound Session board transfer regression failed');
}
