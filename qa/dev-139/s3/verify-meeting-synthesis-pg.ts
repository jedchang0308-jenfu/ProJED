import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { sha256, type RuntimeConfig } from '../../../server/config.js';
import { RuntimeDatabase, type ExpectedMigration } from '../../../server/db.js';
import { resolveBoard } from '../../../server/domainRead.js';
import { KernelError } from '../../../server/errors.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { createHttpCollaborationAdapter } from '../../../src/services/httpApi/collaborationAdapter.js';
import { createHttpDomainReadAdapter } from '../../../src/services/httpApi/domainReadAdapter.js';
import { createHttpMeetingSynthesisAdapter } from '../../../src/services/httpApi/meetingSynthesisAdapter.js';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createHttpSessionAdapter } from '../../../src/services/httpApi/sessionAdapter.js';
import {
  MEETING_SYNTHESIS_CONTRACT_VERSION,
  validateMeetingSynthesisOutput,
  type MeetingSynthesisInput,
} from '../../../src/utils/meetingRecordSynthesis.js';

type SessionLabel = 'qa-meeting-owner' | 'qa-meeting-reader' | 'qa-meeting-outsider';
type ProviderMode =
  | 'valid'
  | 'fallback'
  | 'quota'
  | 'unavailable'
  | 'invalid-json'
  | 'unknown-task'
  | 'quality-failure'
  | { kind: 'hold'; started(): void; gate: Promise<void>; aborted?(): void; returned?(): void };

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function waitBounded(promise: Promise<void>, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), 4_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function migrationSet(config: RuntimeConfig): ExpectedMigration[] {
  return config.profile.migrations.map(({ version, path }) => ({
    version,
    checksum: sha256(readFileSync(path)),
  }));
}

function requireHttpError(error: unknown, code?: string, status?: number): boolean {
  assert.ok(error instanceof HttpApiError);
  if (code !== undefined) assert.equal(error.code, code);
  if (status !== undefined) assert.equal(error.status, status);
  return true;
}

/**
 * Native integration exercise for meeting synthesis using a local HTTP server
 * and a deterministic synthetic provider. The provider never calls Gemini.
 */
export async function verifyMeetingSynthesisPostgres(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  owner: ServerActorV1,
  reader: ServerActorV1,
  outsider: ServerActorV1,
): Promise<void> {
  const expected = migrationSet(config);
  const httpConfig: RuntimeConfig = { ...config, host: '127.0.0.1', port: 0 };
  const httpDatabase = new RuntimeDatabase(httpConfig);
  const actors: Readonly<Record<SessionLabel, ServerActorV1>> = {
    'qa-meeting-owner': owner,
    'qa-meeting-reader': reader,
    'qa-meeting-outsider': outsider,
  };
  const providerCalls: Array<{
    model: 'gemini-3.5-flash' | 'gemini-3.1-flash-lite';
    responseMimeType?: 'application/json';
    temperature?: number;
  }> = [];
  const responseStatuses: Array<{ session: SessionLabel; path: string; status: number }> = [];
  let mode: ProviderMode = 'valid';
  let contextDriftSession: SessionLabel | null = null;

  const taskId = randomUUID();
  const synthesisInput: MeetingSynthesisInput = {
    title: 'DEV-139 native meeting synthesis fixture',
    participantsText: 'Workspace owner, invited reader',
    rawContent: `確認會議決議與後續安排，任務 @[會議追蹤](task:${taskId}) 已完成討論。`,
    taskLinks: [{ nodeId: taskId, role: 'related' }],
    tasks: [{ id: taskId, title: '會議追蹤', parentId: null, path: [], depth: 0 }],
    activities: [],
    occurredAt: Date.now(),
    requiredContractVersion: MEETING_SYNTHESIS_CONTRACT_VERSION,
  };
  // The local fallback repeats source prose; a synthetic provider success must
  // satisfy the unchanged provider quality oracle, including deduplication.
  const providerFixture = {
    content: [
      '1. 本次會議總結',
      '- 已確認會議決議，後續依討論結果安排追蹤工作。',
      '',
      '2. 任務討論與結論',
      `2.1 @[會議追蹤](task:${taskId})`,
      '確認會議追蹤的討論結果，依照會議約定整理後續安排。',
    ].join('\n'),
    linkedTaskIds: [taskId],
  };
  assert.equal(validateMeetingSynthesisOutput(synthesisInput, providerFixture).passed, true,
    'synthetic fixture must satisfy the local quality oracle');
  const validProviderOutput = JSON.stringify({
    content: providerFixture.content,
    warnings: ['此為 synthetic provider 測試輸出。'],
    linkedTaskIds: providerFixture.linkedTaskIds,
  });

  const provider = {
    async generate(
      request: {
        model: 'gemini-3.5-flash' | 'gemini-3.1-flash-lite';
        prompt: string;
        responseMimeType?: 'application/json';
        temperature?: number;
      },
      signal?:AbortSignal,
    ): Promise<string> {
      providerCalls.push({
        model: request.model,
        responseMimeType: request.responseMimeType,
        temperature: request.temperature,
      });
      const currentMode = mode;
      if (typeof currentMode === 'object') {
        currentMode.started();
        const aborted=()=>currentMode.aborted?.();
        if(signal?.aborted)aborted();
        signal?.addEventListener('abort',aborted,{once:true});
        try{await currentMode.gate;}finally{signal?.removeEventListener('abort',aborted);}
        currentMode.returned?.();
        return validProviderOutput;
      }
      if (currentMode === 'fallback' && request.model === 'gemini-3.5-flash') {
        throw new KernelError('RAG_MODEL_UNAVAILABLE', 'synthetic model unavailable', 503);
      }
      if (currentMode === 'quota') {
        throw new KernelError('RAG_QUOTA_EXCEEDED', 'synthetic quota limit', 429);
      }
      if (currentMode === 'unavailable') {
        throw new KernelError('RAG_PROVIDER_UNAVAILABLE', 'synthetic provider unavailable', 503);
      }
      if (currentMode === 'invalid-json') return '{invalid json';
      if (currentMode === 'unknown-task') {
        return JSON.stringify({
          content: `${providerFixture.content}\n\n2.99 @[陌生任務](task:${randomUUID()})\n根據會議記錄確認後續處理方式。`,
          warnings: [],
          linkedTaskIds: providerFixture.linkedTaskIds,
        });
      }
      if (currentMode === 'quality-failure') {
        return JSON.stringify({
          content: [
            '1. 本次會議總結',
            '- 已確認會議重點與後續安排。',
            '',
            '2. 任務討論與結論',
            `2.1 @[會議追蹤](task:${taskId})`,
          ].join('\n'),
          warnings: [],
          linkedTaskIds: [taskId],
        });
      }
      return validProviderOutput;
    },
  };

  const server = createKernelHttpServer(httpConfig, httpDatabase, expected, {
    resolveActor: async (request: IncomingMessage, options?: { readonly refresh?: boolean }) => {
      const cookie = request.headers.cookie;
      if (typeof cookie !== 'string' || !Object.prototype.hasOwnProperty.call(actors, cookie)) {
        throw new KernelError('ACTOR_INVALID', 'QA session is unavailable', 401);
      }
      const label = cookie as SessionLabel;
      const actor = actors[label];
      if (options?.refresh && contextDriftSession === label
          && request.url?.includes('/meeting:synthesize')) {
        return { ...actor, contextId: randomUUID() };
      }
      return actor;
    },
    meetingSynthesisProvider: provider,
  });

  let serverStarted = false;
  let base = '';
  const fetchFor = (session: SessionLabel, originOverride?: string): HttpApiFetch => async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('cookie', session);
    headers.set('origin', originOverride ?? base);
    const path = String(input);
    const response = await fetch(new URL(path, base), { ...init, headers });
    responseStatuses.push({ session, path: new URL(path, base).pathname, status: response.status });
    return response;
  };
  const clientFor = (session: SessionLabel, actor: ServerActorV1, originOverride?: string) => {
    const client = new HttpApiClient(fetchFor(session, originOverride));
    client.bindExpectedActor({ accountId: actor.localUserId, contextId: actor.contextId });
    return client;
  };

  const ownerClient = clientFor('qa-meeting-owner', owner);
  const ownerCollaboration = createHttpCollaborationAdapter(ownerClient);
  const ownerRead = createHttpDomainReadAdapter(ownerClient);
  const readerClient = new HttpApiClient(fetchFor('qa-meeting-reader'));
  const readerSession = createHttpSessionAdapter(readerClient);
  const outsiderClient = clientFor('qa-meeting-outsider', outsider);
  const ownerSynthesis = createHttpMeetingSynthesisAdapter(ownerClient);
  const readerSynthesis = createHttpMeetingSynthesisAdapter(readerClient);
  const outsiderSynthesis = createHttpMeetingSynthesisAdapter(outsiderClient);
  const fixtures: Array<{ workspaceId: string }> = [];
  let holdRelease: (() => void) | undefined;
  let pendingProviderRequest: Promise<unknown> | undefined;

  const fixtureScope = async (workspaceId: string, boardId: string) => runActorTransaction(
    database,
    config,
    owner,
    async port => {
      const board = await resolveBoard(port, workspaceId, boardId);
      return { tenantId: board.tenantId, projectId: board.id };
    },
  );
  const counts = async (workspaceId: string, boardId: string) => {
    const scope = await fixtureScope(workspaceId, boardId);
    return runActorTransaction(database, config, owner, async port => {
      const result = await port.query<{
        task_count: string;
        record_count: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM projed_core.wbs_items
            WHERE tenant_id = $1::uuid AND project_id = $2::uuid) AS task_count,
          (SELECT count(*)::text FROM projed_core.knowledge_records
            WHERE tenant_id = $1::uuid AND project_id = $2::uuid) AS record_count
      `, [scope.tenantId, scope.projectId]);
      const row = result.rows[0];
      assert.ok(row);
      return {
        taskCount: Number(row.task_count),
        recordCount: Number(row.record_count),
      };
    });
  };
  const auditRows = async (actor: ServerActorV1, workspaceId: string, boardId: string) => {
    const scope = await runActorTransaction(database, config, owner, async port => {
      const board = await resolveBoard(port, workspaceId, boardId);
      return { tenantId: board.tenantId, projectId: board.id };
    });
    return runActorTransaction(database, config, actor, async port => {
      const result = await port.query<{ response_metadata: string; prompt_hash: string | null }>(`
        SELECT response_metadata::text AS response_metadata, prompt_hash
          FROM projed_core.llm_access_logs
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid
      `, [scope.tenantId, scope.projectId]);
      return result.rows;
    });
  };
  const assertMeetingStatus = (session: SessionLabel, fromIndex: number, status: number) => {
    const request = responseStatuses.slice(fromIndex).filter(item =>
      item.session === session && item.path.includes('/meeting:synthesize'));
    assert.equal(request.at(-1)?.status, status);
  };

  const cleanupErrors: unknown[] = [];
  let failed=false;
  let failure:unknown;
  try {
    const address = await server.listen();
    serverStarted = true;
    base = `http://${address.host}:${address.port}`;

    const readerProfile = await readerSession.getSession();
    assert.equal(readerProfile.uid, reader.localUserId);
    const readerEmail = readerProfile.email;
    assert.ok(readerEmail, 'reader must have its own profile email for the local invite');

    const workspace = await ownerCollaboration.createWorkspace(`DEV-139 meeting ${randomUUID()}`);
    fixtures.push({ workspaceId: workspace.id });
    const board = await ownerCollaboration.createBoard(workspace.id, 'Meeting synthesis fixture');

    const secondWorkspace = await ownerCollaboration.createWorkspace(`DEV-139 meeting scope ${randomUUID()}`);
    fixtures.push({ workspaceId: secondWorkspace.id });
    const secondBoard = await ownerCollaboration.createBoard(secondWorkspace.id, 'Separate synthesis fixture');

    const inviteToken = randomBytes(32).toString('base64url');
    await ownerCollaboration.createInvite(workspace.id, board.id, {
      email: readerEmail,
      tokenHash: createHash('sha256').update(inviteToken).digest('hex'),
      expiresAt: Date.now() + 10 * 60 * 1000,
      defaultRole: 'viewer',
    });
    const readerCollaboration = createHttpCollaborationAdapter(readerClient);
    await readerCollaboration.acceptInvite({
      token: inviteToken,
      userId: readerProfile.uid,
      email: readerEmail,
      displayName: readerProfile.displayName,
    });
    const readerMember = (await ownerRead.listBoardMembers(workspace.id, board.id))
      .find(member => member.userId === reader.localUserId);
    assert.equal(readerMember?.role, 'viewer', 'the invited reader must have board viewer access');

    const baseline = await counts(workspace.id, board.id);
    assert.equal(baseline.taskCount, 0);
    assert.equal(baseline.recordCount, 0);
    const ownerAuditBaseline = (await auditRows(owner, workspace.id, board.id)).length;

    const ownerResponseStart = responseStatuses.length;
    const ownerResult = await ownerSynthesis.synthesize(synthesisInput, {
      workspaceId: workspace.id,
      boardId: board.id,
    });
    assertMeetingStatus('qa-meeting-owner', ownerResponseStart, 200);
    assert.equal(ownerResult.provider, 'google');
    assert.equal(ownerResult.model, 'gemini-3.5-flash');
    assert.equal(ownerResult.contractVersion, MEETING_SYNTHESIS_CONTRACT_VERSION);
    assert.equal(ownerResult.quality.passed, true);
    assert.deepEqual(ownerResult.normalization, {
      receivedActivityCount: 0,
      acceptedActivityCount: 0,
      droppedActivityCount: 0,
    });
    assert.ok(ownerResult.linkedTaskIds.includes(taskId));
    assert.ok(providerCalls.length >= 1);
    assert.deepEqual(providerCalls[0], {
      model: 'gemini-3.5-flash',
      responseMimeType: 'application/json',
      temperature: 0.2,
    });

    const readerResponseStart = responseStatuses.length;
    const readerResult = await readerSynthesis.synthesize(synthesisInput, {
      workspaceId: workspace.id,
      boardId: board.id,
    });
    assertMeetingStatus('qa-meeting-reader', readerResponseStart, 200);
    assert.equal(readerResult.quality.passed, true);

    let callsBefore = providerCalls.length;
    mode = 'fallback';
    const fallbackResult = await ownerSynthesis.synthesize(synthesisInput, {
      workspaceId: workspace.id,
      boardId: board.id,
    });
    assert.equal(fallbackResult.model, 'gemini-3.1-flash-lite');
    assert.deepEqual(providerCalls.slice(callsBefore).map(call => call.model), [
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
    ]);

    for (const failure of [
      { mode: 'quota' as const, status: 429, code: 'RAG_QUOTA_EXCEEDED' },
      { mode: 'unavailable' as const, status: 503, code: 'RAG_PROVIDER_UNAVAILABLE' },
    ]) {
      callsBefore = providerCalls.length;
      mode = failure.mode;
      await assert.rejects(
        ownerSynthesis.synthesize(synthesisInput, { workspaceId: workspace.id, boardId: board.id }),
        error => requireHttpError(error, failure.code, failure.status),
      );
      assert.equal(providerCalls.length - callsBefore, 1, `${failure.code} must not retry another model`);
    }

    for (const failure of [
      { mode: 'invalid-json' as const, code: 'SYNTHESIS_INVALID_RESPONSE' },
      { mode: 'unknown-task' as const, code: 'QUALITY_GATE_FAILED' },
      { mode: 'quality-failure' as const, code: 'QUALITY_GATE_FAILED' },
    ]) {
      mode = failure.mode;
      await assert.rejects(
        ownerSynthesis.synthesize(synthesisInput, { workspaceId: workspace.id, boardId: board.id }),
        error => requireHttpError(error, failure.code, 502),
      );
    }

    const deniedCalls = providerCalls.length;
    await assert.rejects(
      outsiderSynthesis.synthesize(synthesisInput, { workspaceId: workspace.id, boardId: board.id }),
      error => requireHttpError(error, 'RESOURCE_NOT_FOUND', 404),
    );
    assert.equal(providerCalls.length, deniedCalls, 'outsider must be denied before provider invocation');

    const crossWorkspaceCalls = providerCalls.length;
    await assert.rejects(
      ownerSynthesis.synthesize(synthesisInput, { workspaceId: workspace.id, boardId: secondBoard.id }),
      error => requireHttpError(error, undefined, 404),
    );
    assert.equal(providerCalls.length, crossWorkspaceCalls, 'cross-workspace board reference must be denied before provider invocation');

    const wrongExpectedClient = clientFor('qa-meeting-owner', reader);
    const wrongExpectedSynthesis = createHttpMeetingSynthesisAdapter(wrongExpectedClient);
    const wrongExpectedCalls = providerCalls.length;
    await assert.rejects(
      wrongExpectedSynthesis.synthesize(synthesisInput, { workspaceId: workspace.id, boardId: board.id }),
      error => requireHttpError(error, 'ACTOR_CHANGED', 409),
    );
    assert.equal(providerCalls.length, wrongExpectedCalls, 'expected-actor mismatch must be denied before provider invocation');

    const wrongOriginClient = clientFor('qa-meeting-owner', owner, 'https://other.invalid');
    const wrongOriginSynthesis = createHttpMeetingSynthesisAdapter(wrongOriginClient);
    const wrongOriginCalls = providerCalls.length;
    await assert.rejects(
      wrongOriginSynthesis.synthesize(synthesisInput, { workspaceId: workspace.id, boardId: board.id }),
      error => requireHttpError(error, 'ACCESS_DENIED', 403),
    );
    assert.equal(providerCalls.length, wrongOriginCalls, 'cross-origin write must be denied before provider invocation');

    const permissions = await ownerRead.getBoardRolePermissions(workspace.id, board.id);
    const holdStarted = deferred<void>();
    const holdGate = deferred<void>();
    holdRelease = () => holdGate.resolve(undefined);
    mode = { kind: 'hold', started: () => holdStarted.resolve(undefined), gate: holdGate.promise };
    const beforePermissionRace = (await auditRows(reader, workspace.id, board.id)).length;
    assert.equal(beforePermissionRace, 1, 'board viewer must read its own project-scoped synthesis audit');
    const permissionRequest = readerSynthesis.synthesize(synthesisInput, {
      workspaceId: workspace.id,
      boardId: board.id,
    });
    pendingProviderRequest = permissionRequest;
    await waitBounded(holdStarted.promise, 'permission-hold-provider-start');
    await ownerCollaboration.updateRolePermissions(workspace.id, board.id, {
      ...permissions,
      viewer: [],
    });
    holdRelease();
    holdRelease = undefined;
    await waitBounded(
      assert.rejects(permissionRequest, error => error instanceof HttpApiError && (
        (error.code === 'ACCESS_DENIED' && error.status === 403)
        || (error.code === 'RESOURCE_NOT_FOUND' && error.status === 404)
      )),
      'permission-hold-response',
    );
    pendingProviderRequest = undefined;
    await ownerCollaboration.updateRolePermissions(workspace.id, board.id, permissions);
    const afterPermissionRace = (await auditRows(reader, workspace.id, board.id)).length;
    assert.equal(afterPermissionRace, beforePermissionRace,
      'after restoring viewer access, the revoked held request must not have created a success audit');

    const contextHoldStarted = deferred<void>();
    const contextHoldGate = deferred<void>();
    holdRelease = () => contextHoldGate.resolve(undefined);
    mode = { kind: 'hold', started: () => contextHoldStarted.resolve(undefined), gate: contextHoldGate.promise };
    const beforeContextRace = (await auditRows(owner, workspace.id, board.id)).length;
    const contextRequest = ownerSynthesis.synthesize(synthesisInput, {
      workspaceId: workspace.id,
      boardId: board.id,
    });
    pendingProviderRequest = contextRequest;
    await waitBounded(contextHoldStarted.promise, 'context-hold-provider-start');
    contextDriftSession = 'qa-meeting-owner';
    holdRelease();
    holdRelease = undefined;
    await waitBounded(
      assert.rejects(contextRequest, error => requireHttpError(error, 'ACTOR_CHANGED', 409)),
      'context-hold-response',
    );
    pendingProviderRequest = undefined;
    contextDriftSession = null;
    const afterContextRace = (await auditRows(owner, workspace.id, board.id)).length;
    assert.equal(afterContextRace, beforeContextRace,
      'a late response after actor context refresh must not create a success audit');

    const cancelStarted=deferred<void>(),cancelGate=deferred<void>();
    const serverCancelled=deferred<void>(),lateProviderReturned=deferred<void>();
    holdRelease=()=>cancelGate.resolve(undefined);
    mode={kind:'hold',started:()=>cancelStarted.resolve(undefined),gate:cancelGate.promise,
      aborted:()=>serverCancelled.resolve(undefined),returned:()=>lateProviderReturned.resolve(undefined)};
    const beforeCancel=(await auditRows(owner,workspace.id,board.id)).length;
    const abortController=new AbortController();
    const cancelRequest=ownerSynthesis.synthesize(synthesisInput,{workspaceId:workspace.id,boardId:board.id,signal:abortController.signal});
    pendingProviderRequest=cancelRequest;
    await waitBounded(cancelStarted.promise,'cancel-provider-start');
    abortController.abort();
    await assert.rejects(cancelRequest,error=>error instanceof DOMException&&error.name==='AbortError');
    await waitBounded(serverCancelled.promise,'server-observed-client-cancel');
    holdRelease();holdRelease=undefined;
    await waitBounded(lateProviderReturned.promise,'late-provider-return-after-cancel');
    pendingProviderRequest=undefined;
    assert.equal((await auditRows(owner,workspace.id,board.id)).length,beforeCancel,
      'a provider result after observed cancellation cannot create a success audit');

    const finalCounts = await counts(workspace.id, board.id);
    assert.equal(finalCounts.taskCount, baseline.taskCount, 'synthesis must not create or change task rows');
    assert.equal(finalCounts.recordCount, baseline.recordCount, 'synthesis must not create or change record rows');
    const ownerAuditRows = await auditRows(owner, workspace.id, board.id);
    const readerAuditRows = await auditRows(reader, workspace.id, board.id);
    assert.equal(ownerAuditRows.length, ownerAuditBaseline + 2,
      'owner synthesis and model fallback success should be audited');
    assert.equal(readerAuditRows.length, 1,
      'only the reader successful synthesis should have a project audit row');
    for (const row of [...ownerAuditRows, ...readerAuditRows]) {
      assert.ok(row.prompt_hash && /^[a-f0-9]{64}$/u.test(row.prompt_hash));
      assert.equal(row.response_metadata.includes(synthesisInput.rawContent), false,
        'LLM audit response metadata must not contain source rawContent');
    }
  } catch(error) {
    failed=true;
    failure=error;
  } finally {
    holdRelease?.();
    await pendingProviderRequest?.catch(() => undefined);
    contextDriftSession = null;
    for (const fixture of [...fixtures].reverse()) {
      try {
        await ownerCollaboration.deleteWorkspace(fixture.workspaceId);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      if (serverStarted) await server.shutdown();
      else await httpDatabase.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if(failed){
    if(cleanupErrors.length)throw new AggregateError([failure,...cleanupErrors],'Meeting synthesis verification and cleanup failed');
    throw failure;
  }
  if(cleanupErrors.length)throw new AggregateError(cleanupErrors,'Meeting synthesis cleanup failed');
}
