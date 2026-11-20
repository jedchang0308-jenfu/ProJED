import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
  const ownedSessions: Array<{ hash: string; publicOrigin: string }> = [];
  const actors = new Map<string, ServerActorV1>();
  const ownedWorkspaces: string[] = [];
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
  const newSession = async () => {
    const actor = await startBrowserFixtureSession(database, config, 'owner');
    assert.ok(actor.sessionTokenHash);
    const stored = await sessions.readSession(actor.sessionTokenHash);
    assert.ok(stored);
    ownedSessions.push({ hash: actor.sessionTokenHash, publicOrigin: stored.publicOrigin });
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
          const cleanupActor = await newSession();
          await runActorTransaction(database, config, cleanupActor,
            port => commands.deleteWorkspace(port, workspaceId));
        });
      }
      cleanupComplete = observations.filter(item => item.name === 'cleanup-owned-workspace')
        .every(item => item.status === 'PASS');
      for (const session of ownedSessions) {
        await sessions.revokeSession(session.hash, session.publicOrigin, Date.now());
        assert.equal(await sessions.readSession(session.hash), null);
      }
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
