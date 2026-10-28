import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { QueryResultRow } from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { KernelError } from '../../../server/errors.js';
import { createKernelHttpServer } from '../../../server/http.js';
import type { RagProvider } from '../../../server/geminiRagProvider.js';
import { CollaborationWriteRepository } from '../../../server/collaborationWrite.js';
import { RecordActivityRepository, type DomainKnowledgeRecordInput } from '../../../server/recordActivity.js';
import { PostgresAppSessionStore } from '../../../server/postgresAppSessionStore.js';
import type { CompleteLoginInput, StoredAppSession, StoredLoginIntent } from '../../../server/appSessionStore.js';
import type { ProducerVerifiedIdentity } from '../../../server/identityConsumer.js';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createHttpRagAdapter } from '../../../src/services/httpApi/ragAdapter.js';
import type { RagRetrievalRequest, RagRetrievalResponse } from '../../../src/services/rag/ragContract.js';

const ORIGIN = 'https://projed.example.invalid';
const IDENTITY_ISSUER = 'https://securetoken.google.com/local-test';
const IDENTITY_MANIFEST = 'c5471fa9686566cf2ecb42f6f78f52eed5188e36bcfd8208609a96fc0f829e6a';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 3072;

function opaqueHash(): string {
  return randomBytes(32).toString('hex');
}

function loginIntent(): StoredLoginIntent {
  return {
    tokenHash: opaqueHash(),
    stateHash: opaqueHash(),
    entry: 'main',
    publicOrigin: ORIGIN,
    returnPath: '/',
    oldSessionHash: null,
    codeVerifier: randomBytes(32).toString('base64url'),
    status: 'pending',
    claimHash: null,
    completedSessionHash: null,
    expiresAtMs: Date.now() + 5 * 60_000,
  };
}

function identity(label: string, email: string): ProducerVerifiedIdentity {
  const now = Date.now();
  const googleSubject = `synthetic-rag-${label}-${randomUUID()}`;
  return {
    contractVersion: 'jenfu.sso-handoff.v4',
    manifestSha256: IDENTITY_MANIFEST,
    issuer: 'https://platform.example.invalid/api/sso',
    audience: 'projed',
    identityIssuer: IDENTITY_ISSUER,
    identitySubject: `firebase-${googleSubject}`,
    principalId: `principal:personal:${googleSubject}`,
    principalKind: 'personal',
    googleSubject,
    employeeId: null,
    verifiedEmail: email,
    authEpoch: 1,
    authenticatedAtMs: now - 60_000,
    revokedBeforeMs: null,
    sourceSessionExpiresAtMs: now + 8 * 60 * 60_000,
    issuedAtMs: now - 1,
    expiresAtMs: now + 60_000,
    currentStateExpiresAtMs: now + 10_000,
    mappingRevision: '12',
  };
}

async function firstLogin(
  store: PostgresAppSessionStore,
  label: string,
): Promise<{ session: StoredAppSession; actor: ServerActorV1 }> {
  const intent = loginIntent();
  const proof = identity(label, `${label}-${randomUUID()}@example.invalid`);
  const claimHash = opaqueHash();
  await store.begin(intent);
  assert.equal((await store.claim(intent.tokenHash, intent.stateHash, claimHash, Date.now())).status, 'processing');
  const input: CompleteLoginInput = {
    tokenHash: intent.tokenHash,
    stateHash: intent.stateHash,
    claimHash,
    sessionTokenHash: opaqueHash(),
    contextId: randomUUID(),
    identity: proof,
    entry: 'main',
    nowMs: Date.now(),
  };
  const session = await store.complete(input);
  assert.equal(session.identity.googleSubject, proof.googleSubject);
  assert.equal(session.identity.principalKind, 'personal');
  assert.equal(session.identity.employeeId, null);
  const actor: ServerActorV1 = {
    principalId: session.identity.principalId,
    localUserId: session.localUserId,
    entry: session.entry,
    contextId: session.contextId,
    accountGuardRevision: session.accountGuardRevision,
    expiresAtMs: session.expiresAtMs,
  };
  return { session, actor };
}

interface ProviderBarrier {
  readonly needle: string;
  readonly reached: Promise<void>;
  release(): void;
}

interface ActiveProviderBarrier extends ProviderBarrier {
  readonly resume: Promise<void>;
  readonly reachedResolve: () => void;
}

function deterministicProvider(): {
  provider: RagProvider;
  counts: { embed: number; generate: number };
  holdEmbedding(needle: string): ProviderBarrier;
} {
  const counts = { embed: 0, generate: 0 };
  const vector = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[0] = 1;
  let barrier: ActiveProviderBarrier | null = null;
  const provider: RagProvider = {
    async embed(content) {
      counts.embed += 1;
      const current = barrier;
      if (current && content.includes(current.needle)) {
        barrier = null;
        current.reachedResolve();
        await current.resume;
      }
      return [...vector];
    },
    async generate() {
      counts.generate += 1;
      return 'synthetic-rag-answer';
    },
  };
  return {
    provider,
    counts,
    holdEmbedding(needle) {
      let reachedResolve!: () => void;
      let resumeResolve!: () => void;
      const reached = new Promise<void>(resolve => { reachedResolve = resolve; });
      const resume = new Promise<void>(resolve => { resumeResolve = resolve; });
      const current: ActiveProviderBarrier = {
        needle,
        reached,
        resume,
        reachedResolve,
        release: resumeResolve,
      };
      barrier = current;
      return { needle, reached, release: resumeResolve };
    },
  };
}

interface WorkspaceBoard {
  readonly workspaceId: string;
  readonly boardId: string;
}

async function createWorkspaceBoard(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  actor: ServerActorV1,
  title: string,
): Promise<WorkspaceBoard> {
  const collaboration = new CollaborationWriteRepository();
  const workspace = await runActorTransaction(database, config, actor,
    port => collaboration.createWorkspace(port, { title: `${title} workspace` }));
  const board = await runActorTransaction(database, config, actor,
    port => collaboration.createBoard(port, workspace.id, { title: `${title} board` }));
  return { workspaceId: workspace.id, boardId: board.id };
}

async function saveRecord(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  actor: ServerActorV1,
  scope: WorkspaceBoard,
  input: DomainKnowledgeRecordInput,
) {
  const records = new RecordActivityRepository();
  return runActorTransaction(database, config, actor,
    port => records.upsertRecord(port, scope.workspaceId, scope.boardId, input));
}

interface RecordSnapshot {
  readonly pointer: string | null;
  readonly documentEnabled: boolean | null;
  readonly documentHash: string | null;
  readonly versions: Array<{ id: string; version: number; contentHash: string }>;
  readonly chunks: Array<{ id: string; versionId: string; content: string; hash: string | null }>;
  readonly jobs: Array<{ id: string; status: string; versionId: string | null; hash: string | null; lease: string | null }>;
}

async function readRecordSnapshot(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  actor: ServerActorV1,
  scope: WorkspaceBoard,
  recordId: string,
): Promise<RecordSnapshot> {
  return runActorTransaction(database, config, actor, async port => {
    const source = await port.query<QueryResultRow & { source_document_id: string | null }>(`
      SELECT source_document_id::text FROM projed_core.knowledge_records
       WHERE tenant_id=$1::uuid AND project_id=$2::uuid AND id=$3::uuid
    `, [scope.workspaceId, scope.boardId, recordId]);
    assert.equal(source.rows.length, 1);
    const pointer = source.rows[0]!.source_document_id;
    if (!pointer) return { pointer: null, documentEnabled: null, documentHash: null, versions: [], chunks: [], jobs: [] };
    await port.authorizeRecordRagMutation(scope.workspaceId, scope.boardId, recordId);
    const documents = await port.query<QueryResultRow & { id: string; rag_enabled: boolean; content_hash: string | null }>(`
      SELECT id::text, rag_enabled, content_hash FROM projed_core.documents
       WHERE tenant_id=$1::uuid AND id=$2::uuid AND source_table='knowledge_records' AND source_id=$3::uuid
    `, [scope.workspaceId, pointer, recordId]);
    assert.equal(documents.rows.length, 1);
    const versions = await port.query<QueryResultRow & { id: string; version: number; content_hash: string }>(`
      SELECT id::text, version, content_hash FROM projed_core.document_versions
       WHERE tenant_id=$1::uuid AND document_id=$2::uuid ORDER BY version,id
    `, [scope.workspaceId, pointer]);
    const chunks = await port.query<QueryResultRow & { id: string; version_id: string; content: string; hash: string | null }>(`
      SELECT chunk.id::text, chunk.document_version_id::text AS version_id, chunk.content, embedding.content_hash AS hash
        FROM projed_core.document_chunks chunk
        LEFT JOIN projed_core.document_embeddings embedding
          ON embedding.tenant_id=chunk.tenant_id AND embedding.chunk_id=chunk.id
         AND embedding.provider='google' AND embedding.model=$3 AND embedding.dimensions=3072
       WHERE chunk.tenant_id=$1::uuid AND chunk.document_id=$2::uuid ORDER BY chunk.document_version_id,chunk.chunk_index
    `, [scope.workspaceId, pointer, EMBEDDING_MODEL]);
    const jobs = await port.query<QueryResultRow & {
      id: string; status: string; version_id: string | null; hash: string | null; lease: string | null;
    }>(`
      SELECT id::text, status, document_version_id::text AS version_id, content_hash AS hash, lease_token AS lease
        FROM projed_core.rag_sync_jobs WHERE tenant_id=$1::uuid AND source_document_id=$2::uuid ORDER BY created_at,id
    `, [scope.workspaceId, pointer]);
    return {
      pointer,
      documentEnabled: documents.rows[0]!.rag_enabled,
      documentHash: documents.rows[0]!.content_hash,
      versions: versions.rows.map(row => ({ id: row.id, version: row.version, contentHash: row.content_hash })),
      chunks: chunks.rows.map(row => ({ id: row.id, versionId: row.version_id, content: row.content, hash: row.hash })),
      jobs: jobs.rows.map(row => ({ id: row.id, status: row.status, versionId: row.version_id, hash: row.hash, lease: row.lease })),
    };
  });
}

function apiFetch(base: string, cookieLabel: string): HttpApiFetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('cookie', `__session=${cookieLabel}`);
    headers.set('origin', base);
    return fetch(new URL(String(input), base), { ...init, headers });
  };
}

function ragClient(base: string, cookie: string, actor: ServerActorV1) {
  const client = new HttpApiClient(apiFetch(base, cookie));
  client.bindExpectedActor({ accountId: actor.localUserId, contextId: actor.contextId });
  return createHttpRagAdapter(client);
}

function request(scope: WorkspaceBoard, projectId: string | null, query: string): RagRetrievalRequest {
  return {
    tenantId: scope.workspaceId,
    projectId,
    query,
    generationModel: 'gemini-3.1-flash-lite',
    matchThreshold: 0,
    matchCount: 20,
  };
}

function hasSqlState(error: unknown, code: string): boolean {
  return error instanceof KernelError && error.code === 'DB_UNAVAILABLE'
    && Boolean(error.cause && typeof error.cause === 'object' && (error.cause as { code?: unknown }).code === code);
}

async function closeHttpServer(server: ReturnType<typeof createKernelHttpServer>['server']): Promise<void> {
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

/** Real disposable PostgreSQL, real RLS/HTTP path, synthetic identities/provider only. */
export async function verifyRagPostgres(database: RuntimeDatabase, config: RuntimeConfig): Promise<void> {
  const store = new PostgresAppSessionStore(database);
  const ownerLogin = await firstLogin(store, 'rag-owner');
  const guestLogin = await firstLogin(store, 'rag-board-guest');
  const outsiderLogin = await firstLogin(store, 'rag-outsider');
  const ownerScope = await createWorkspaceBoard(database, config, ownerLogin.actor, 'RAG owner');
  const outsiderScope = await createWorkspaceBoard(database, config, outsiderLogin.actor, 'RAG outsider');

  const inviteToken = randomBytes(32).toString('base64url');
  const invitation = await runActorTransaction(database, config, ownerLogin.actor, port =>
    new CollaborationWriteRepository().createInvite(port, ownerScope.workspaceId, ownerScope.boardId, {
      email: guestLogin.session.identity.verifiedEmail!,
      tokenHash: createHash('sha256').update(inviteToken).digest('hex'),
      expiresAt: Date.now() + 60 * 60_000,
      defaultRole: 'viewer',
    }));
  assert.equal(invitation.status, 'pending');
  await runActorTransaction(database, config, guestLogin.actor,
    port => new CollaborationWriteRepository().acceptInvite(port, inviteToken));
  const guestCapabilities = await runActorTransaction(database, config, guestLogin.actor, async port => {
    const result = await port.query<QueryResultRow & { workspace: boolean; board: boolean }>(`
      SELECT projed_core.actor_has_workspace_capability_v1($1::uuid,'read_workspace') AS workspace,
             projed_core.actor_has_board_capability_v1($1::uuid,$2::uuid,'read_board') AS board
    `, [ownerScope.workspaceId, ownerScope.boardId]);
    return result.rows[0];
  });
  assert.equal(guestCapabilities?.workspace, false);
  assert.equal(guestCapabilities?.board, true);

  const provider = deterministicProvider();
  const actorByCookie = new Map<string, ServerActorV1>([
    ['rag-owner', ownerLogin.actor],
    ['rag-board-guest', guestLogin.actor],
    ['rag-outsider', outsiderLogin.actor],
  ]);
  const httpConfig: RuntimeConfig = { ...config, host: '127.0.0.1', port: 0 };
  const http = createKernelHttpServer(httpConfig, database, [], {
    resolveActor: async (incoming: IncomingMessage) => {
      const cookie = incoming.headers.cookie;
      const label = typeof cookie === 'string' && cookie.startsWith('__session=') ? cookie.slice('__session='.length) : '';
      const actor = actorByCookie.get(label);
      if (!actor) throw new KernelError('IDENTITY_INVALID', 'QA session unavailable', 401);
      return actor;
    },
    ragProvider: provider.provider,
  });
  const address = await http.listen();
  const base = `http://${address.host}:${address.port}`;
  const ownerRag = ragClient(base, 'rag-owner', ownerLogin.actor);
  const guestRag = ragClient(base, 'rag-board-guest', guestLogin.actor);
  const outsiderRag = ragClient(base, 'rag-outsider', outsiderLogin.actor);
  try {
    const fixedOccurredAt = Date.now() - 60_000;
    const recordBase: Omit<DomainKnowledgeRecordInput, 'content' | 'title' | 'status' | 'visibility' | 'id'> = {
      type: 'meeting', occurredAt: fixedOccurredAt, taskLinks: [], metadata: { verification: 'rag-s2' },
    };
    const firstText = `RAG_PUBLISHED_MARKER_${randomUUID()} this verified text is available to project readers.`;
    const published = await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, title: `Published ${randomUUID()}`, content: firstText,
      status: 'published', visibility: 'project',
    });
    assert.equal(published.ragEnabled, true);
    assert.ok(published.sourceDocumentId);

    const first: RagRetrievalResponse = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find the RAG published marker'));
    assert.equal(first.answer, 'synthetic-rag-answer');
    assert.ok(first.chunks.some(chunk => chunk.citation.sourceTable === 'knowledge_records'
      && chunk.citation.sourceId === published.id && chunk.content.includes(firstText)));
    const firstState = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, published.id);
    assert.equal(firstState.documentEnabled, true);
    assert.equal(firstState.versions.length, 1);
    assert.ok(firstState.chunks.length > 0);
    assert.ok(firstState.chunks.every(chunk => chunk.versionId === firstState.versions[0]!.id
      && chunk.hash === firstState.documentHash));
    assert.ok(firstState.jobs.some(job => job.status === 'synced' && job.lease === null
      && job.versionId === firstState.versions[0]!.id && job.hash === firstState.documentHash));

    const editedText = `RAG_EDITED_MARKER_${randomUUID()} revised content has a different hash.`;
    await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, id: published.id, title: published.title, content: editedText,
      status: 'published', visibility: 'project',
    });
    const afterEdit = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, published.id);
    assert.equal(afterEdit.pointer, firstState.pointer);
    assert.equal(afterEdit.versions.length, 2);
    assert.notEqual(afterEdit.documentHash, firstState.documentHash);
    assert.ok(afterEdit.chunks.length > 0);
    assert.ok(afterEdit.chunks.every(chunk => chunk.versionId === afterEdit.versions[1]!.id));
    assert.equal(afterEdit.chunks.some(chunk => chunk.hash === firstState.documentHash), false,
      'Old-version chunks/embeddings must not remain current after an edit');
    const beforeSameSave = afterEdit;
    await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, id: published.id, title: published.title, content: editedText,
      status: 'published', visibility: 'project',
    });
    const afterSameSave = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, published.id);
    assert.equal(afterSameSave.versions.length, beforeSameSave.versions.length,
      'Saving identical content must not add a version');
    assert.equal(afterSameSave.jobs.length, beforeSameSave.jobs.length,
      'Saving identical content must not add a sync job');
    const editedResponse: RagRetrievalResponse = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find the edited marker'));
    assert.ok(editedResponse.chunks.some(chunk => chunk.citation.sourceId === published.id
      && chunk.content.includes(editedText)));
    assert.equal(editedResponse.chunks.some(chunk => chunk.citation.sourceId === published.id
      && chunk.content.includes(firstText)), false);
    const syncedEdit = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, published.id);
    assert.ok(syncedEdit.jobs.some(job => job.status === 'synced' && job.versionId === syncedEdit.versions[1]!.id));

    const draftSource = `RAG_DRAFT_MARKER_${randomUUID()}`;
    const draftRecord = await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, title: `Draft lifecycle ${randomUUID()}`, content: draftSource,
      status: 'published', visibility: 'project',
    });
    const draftBefore: RagRetrievalResponse = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find draft lifecycle marker'));
    assert.ok(draftBefore.chunks.some(chunk => chunk.citation.sourceId === draftRecord.id));
    await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, id: draftRecord.id, title: draftRecord.title, content: draftSource,
      status: 'draft', visibility: 'project',
    });
    const draftState = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, draftRecord.id);
    assert.ok(draftState.pointer);
    assert.equal(draftState.documentEnabled, false);
    assert.equal(draftState.chunks.length, 0);
    const afterDraft: RagRetrievalResponse = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find draft lifecycle marker'));
    assert.equal(afterDraft.chunks.some(chunk => chunk.citation.sourceId === draftRecord.id), false);

    const privateText = `RAG_PRIVATE_MARKER_${randomUUID()}`;
    const privateRecord = await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, title: `Private lifecycle ${randomUUID()}`, content: privateText,
      status: 'published', visibility: 'project',
    });
    const privateIndexed: RagRetrievalResponse = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find private lifecycle marker'));
    assert.ok(privateIndexed.chunks.some(chunk => chunk.citation.sourceId === privateRecord.id));
    await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, id: privateRecord.id, title: privateRecord.title, content: privateText,
      status: 'published', visibility: 'private',
    });
    const privateState = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, privateRecord.id);
    assert.ok(privateState.pointer);
    assert.equal(privateState.documentEnabled, false);
    assert.equal(privateState.chunks.length, 0);
    const afterPrivate: RagRetrievalResponse = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find private lifecycle marker'));
    assert.equal(afterPrivate.chunks.some(chunk => chunk.citation.sourceId === privateRecord.id), false);

    const archivedText = `RAG_ARCHIVE_MARKER_${randomUUID()}`;
    const archivedRecord = await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, title: `Archive lifecycle ${randomUUID()}`, content: archivedText,
      status: 'published', visibility: 'project',
    });
    const archivedIndexed: RagRetrievalResponse = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find archive lifecycle marker'));
    assert.ok(archivedIndexed.chunks.some(chunk => chunk.citation.sourceId === archivedRecord.id));
    await runActorTransaction(database, config, ownerLogin.actor, port =>
      new RecordActivityRepository().archiveRecord(port, ownerScope.workspaceId, ownerScope.boardId, archivedRecord.id));
    const archivedState = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, archivedRecord.id);
    assert.ok(archivedState.pointer);
    assert.equal(archivedState.documentEnabled, false);
    assert.equal(archivedState.chunks.length, 0);
    const afterArchive: RagRetrievalResponse = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find archive lifecycle marker'));
    assert.equal(afterArchive.chunks.some(chunk => chunk.citation.sourceId === archivedRecord.id), false);

    const guestResult: RagRetrievalResponse = await guestRag.query(request(ownerScope, ownerScope.boardId, 'find the edited marker'));
    assert.ok(guestResult.chunks.some(chunk => chunk.citation.sourceId === published.id));
    const guestLogs = await runActorTransaction(database, config, guestLogin.actor, port => port.query<QueryResultRow & { count: number }>(`
      SELECT count(*)::integer AS count FROM projed_core.llm_access_logs
       WHERE tenant_id=$1::uuid AND project_id=$2::uuid AND actor_id=$3::uuid
    `, [ownerScope.workspaceId, ownerScope.boardId, guestLogin.actor.localUserId]));
    assert.ok(Number(guestLogs.rows[0]?.count) >= 1, 'A board reader must be allowed to write/read its project-scoped access log');
    const ownerCannotReadGuestLogs = await runActorTransaction(database, config, ownerLogin.actor,
      port => port.query<QueryResultRow & { count: number }>(`
        SELECT count(*)::integer AS count FROM projed_core.llm_access_logs
         WHERE tenant_id=$1::uuid AND project_id=$2::uuid AND actor_id=$3::uuid
      `, [ownerScope.workspaceId, ownerScope.boardId, guestLogin.actor.localUserId]));
    assert.equal(Number(ownerCannotReadGuestLogs.rows[0]?.count), 0,
      'Project-scoped LLM logs must not expose another actor’s prompts/retrieval ids');

    const guestWorkspaceCalls = provider.counts.embed + provider.counts.generate;
    await assert.rejects(guestRag.query(request(ownerScope, null, 'workspace must be denied')),
      error => error instanceof HttpApiError && (error.status === 403 || error.status === 404));
    assert.equal(provider.counts.embed + provider.counts.generate, guestWorkspaceCalls,
      'Workspace denial must happen before provider access');
    const outsiderCalls = provider.counts.embed + provider.counts.generate;
    await assert.rejects(outsiderRag.query(request(ownerScope, ownerScope.boardId, 'outsider must be denied')),
      error => error instanceof HttpApiError && (error.status === 403 || error.status === 404));
    assert.equal(provider.counts.embed + provider.counts.generate, outsiderCalls,
      'Unrelated principal denial must happen before provider access');
    await assert.rejects(ownerRag.query(request(ownerScope, outsiderScope.boardId, 'cross-workspace board denied')),
      error => error instanceof HttpApiError && (error.status === 403 || error.status === 404));
    assert.equal(provider.counts.embed + provider.counts.generate, outsiderCalls,
      'A board id from another workspace must be denied before provider access');

    const syncedChunk = syncedEdit.chunks[0];
    const syncedJob = syncedEdit.jobs.find(job => job.status === 'synced');
    assert.ok(syncedChunk && syncedJob);
    const forgedVector = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    forgedVector[0] = 1;
    await assert.rejects(runActorTransaction(database, config, ownerLogin.actor, port => port.query(`
      INSERT INTO projed_core.document_embeddings
        (id,tenant_id,chunk_id,provider,model,dimensions,embedding,content_hash)
      VALUES($1::uuid,$2::uuid,$3::uuid,'google',$4,3072,$5::real[],$6)
      ON CONFLICT(chunk_id,provider,model,dimensions) DO UPDATE SET content_hash=EXCLUDED.content_hash
    `, [randomUUID(), ownerScope.workspaceId, syncedChunk.id, EMBEDDING_MODEL, forgedVector, syncedChunk.hash])),
    error => hasSqlState(error, '42501'));
    const unauthorizedJobUpdate = await runActorTransaction(database, config, ownerLogin.actor, port => port.query(`
      UPDATE projed_core.rag_sync_jobs SET metadata=metadata || '{"forged":true}'::jsonb
       WHERE tenant_id=$1::uuid AND id=$2::uuid
      RETURNING id
    `, [ownerScope.workspaceId, syncedJob.id]));
    assert.equal(unauthorizedJobUpdate.rowCount, 0, 'A normal actor without a document/job lease cannot mutate job provenance');
    await assert.rejects(runActorTransaction(database, config, ownerLogin.actor, async port => {
      await port.authorizeRagJobMutation(ownerScope.workspaceId, firstState.pointer!, syncedJob.id, 'a'.repeat(64));
      const lock = await port.query(`SELECT id FROM projed_core.documents
        WHERE tenant_id=$1::uuid AND id=$2::uuid FOR SHARE`, [ownerScope.workspaceId, firstState.pointer]);
      assert.equal(lock.rows.length, 1, 'The worker scope must allow locking an already visible document');
      await port.query(`UPDATE projed_core.documents SET title='forged through worker lock'
        WHERE tenant_id=$1::uuid AND id=$2::uuid`, [ownerScope.workspaceId, firstState.pointer]);
    }), error => hasSqlState(error, '42501'));
    await assert.rejects(runActorTransaction(database, config, ownerLogin.actor, port => port.query(`
      UPDATE projed_core.documents SET source_id=$3::uuid
       WHERE tenant_id=$1::uuid AND id=$2::uuid
    `, [ownerScope.workspaceId, firstState.pointer, randomUUID()])), error => hasSqlState(error, '42501'));

    // More than one request's index budget must resume without exhausting retries.
    const largeRecord = await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, title: `Resumable ${randomUUID()}`, content: 'RAG_RESUMABLE_MARKER '.repeat(2800),
      status: 'published', visibility: 'project',
    });
    const largeInitial = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, largeRecord.id);
    assert.ok(largeInitial.chunks.length > 16 && largeInitial.chunks.length < 32);
    const partial = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find resumable knowledge'));
    assert.match(partial.answer, /^部分知識尚未完成索引/u);
    const largePartial = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, largeRecord.id);
    assert.equal(largePartial.chunks.filter(chunk => chunk.hash === largePartial.documentHash).length, 16);
    assert.ok(largePartial.jobs.some(job => job.status === 'pending' && job.lease === null));
    const resumed = await ownerRag.query(request(ownerScope, ownerScope.boardId, 'find resumable knowledge'));
    assert.equal(resumed.answer, 'synthetic-rag-answer');
    const largeComplete = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, largeRecord.id);
    assert.ok(largeComplete.chunks.every(chunk => chunk.hash === largeComplete.documentHash));
    assert.ok(largeComplete.jobs.some(job => job.status === 'synced' && job.lease === null));

    const raceText = `RAG_RACE_MARKER_${randomUUID()}`;
    const raceRecord = await saveRecord(database, config, ownerLogin.actor, ownerScope, {
      ...recordBase, title: `Race ${raceText}`, content: raceText,
      status: 'published', visibility: 'project',
    });
    const raceState = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, raceRecord.id);
    assert.ok(raceState.pointer);
    const beforeRaceGenerate = provider.counts.generate;
    const barrier = provider.holdEmbedding(raceText);
    const racedQuery = ownerRag.query(request(ownerScope, ownerScope.boardId, 'find a record during concurrent archive'));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        barrier.reached,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('RAG worker did not reach the embedding barrier')), 15_000);
        }),
      ]);
    } catch (error) {
      barrier.release();
      await racedQuery.catch(() => undefined);
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    try {
      await runActorTransaction(database, config, ownerLogin.actor, port =>
        new RecordActivityRepository().archiveRecord(port, ownerScope.workspaceId, ownerScope.boardId, raceRecord.id));
    } catch (error) {
      barrier.release();
      await racedQuery.catch(() => undefined);
      throw error;
    }
    barrier.release();
    // Current RLS can hide the archived document before the claim check runs.
    // Both denial paths must prevent generation and leave no late vector write.
    await assert.rejects(racedQuery,
      error => error instanceof HttpApiError && (
        (error.status === 403 && error.code === 'ACCESS_DENIED')
        || (error.status === 409 && error.code === 'RAG_INDEX_STALE')
      ));
    assert.equal(provider.counts.generate, beforeRaceGenerate,
      'A stale archive race must fail before answer generation');
    const finalRaceState = await readRecordSnapshot(database, config, ownerLogin.actor, ownerScope, raceRecord.id);
    assert.equal(finalRaceState.pointer, raceState.pointer);
    assert.equal(finalRaceState.documentEnabled, false);
    assert.equal(finalRaceState.chunks.length, 0);
    assert.ok(finalRaceState.jobs.every(job => job.status === 'superseded' && job.lease === null));
  } finally {
    await closeHttpServer(http.server);
  }
}
