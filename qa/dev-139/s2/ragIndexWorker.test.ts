import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';

import type { ActorQueryPort } from '../../../server/actorTransaction.js';
import { KernelError } from '../../../server/errors.js';
import type { RagProvider } from '../../../server/geminiRagProvider.js';
import { indexVisibleRagDocuments, validatedRagVector } from '../../../server/ragIndexWorker.js';
import type { RagTransactionRunner } from '../../../server/ragIndexWorker.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOCUMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VERSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const JOB_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CHUNK_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const HASH = 'sha256-v1-5-0123456789abcdef';
const SCOPE = { tenantId: TENANT_ID, projectId: null } as const;

function result<R extends QueryResultRow>(rows: R[] = [], rowCount = rows.length): QueryResult<R> {
  return { rows, rowCount, command: 'SELECT', oid: 0, fields: [] };
}

function code(error: unknown): string | null {
  return error instanceof KernelError ? error.code : null;
}

function fakeWorkerPort() {
  const counts = {
    candidateSelects: 0,
    claimRowLocks: 0,
    acquireUpdates: 0,
    settleUpdates: 0,
    embeddingWrites: 0,
    validations: 0,
  };
  const authorizationTokens: string[] = [];
  let embedded = false;

  const query = async <R extends QueryResultRow>(sql: string): Promise<QueryResult<R>> => {
    const statement = sql.replace(/\s+/gu, ' ').trim();
    let rows: QueryResultRow[] = [];
    let rowCount = 0;

    if (/SELECT document\.id::text,version\.id::text AS version_id/u.test(statement)) {
      counts.candidateSelects += 1;
      if (!embedded) rows = [{ id: DOCUMENT_ID, version_id: VERSION_ID, content_hash: HASH }];
    } else if (/SELECT pg_try_advisory_xact_lock/u.test(statement)) {
      rows = [{ acquired: true }];
    } else if (/SELECT id FROM projed_core\.documents/u.test(statement)) {
      rows = [{ id: DOCUMENT_ID }];
    } else if (/SELECT id FROM projed_core\.rag_sync_jobs/u.test(statement) && /FOR UPDATE/u.test(statement)) {
      rows = [{ id: JOB_ID }];
    } else if (/SELECT id::text FROM projed_core\.rag_sync_jobs/u.test(statement)) {
      counts.claimRowLocks += 1;
      rows = [{ id: JOB_ID }];
    } else if (/SELECT job\.id FROM projed_core\.rag_sync_jobs/u.test(statement)) {
      counts.validations += 1;
      rows = [{ id: JOB_ID }];
    } else if (/SELECT chunk\.id::text,chunk\.content FROM projed_core\.document_chunks/u.test(statement)) {
      rows = embedded ? [] : [{ id: CHUNK_ID, content: 'synthetic worker chunk' }];
    } else if (/UPDATE projed_core\.rag_sync_jobs SET status='running'/u.test(statement)) {
      counts.acquireUpdates += 1;
      rows = [{ id: JOB_ID }];
      rowCount = 1;
    } else if (/INSERT INTO projed_core\.document_embeddings/u.test(statement)) {
      counts.embeddingWrites += 1;
      embedded = true;
      rowCount = 1;
    } else if (/SELECT count\(\*\)::integer AS total/u.test(statement)) {
      rows = [{ total: 1, missing: embedded ? 0 : 1 }];
    } else if (/UPDATE projed_core\.rag_sync_jobs SET status=\$4/u.test(statement)) {
      counts.settleUpdates += 1;
      rows = [{ id: JOB_ID }];
      rowCount = 1;
    }

    return result(rows as R[], rowCount);
  };

  const port = {
    query: query as ActorQueryPort['query'],
    async authorizeRagJobMutation(_tenantId: string, _documentId: string, _jobId: string, claimToken?: string) {
      if (claimToken) authorizationTokens.push(claimToken);
    },
    async authorizeRecordRagMutation() {},
    async authorizeWorkspaceBootstrap() {},
    async authorizeBoardMutation() {},
    async authorizeBoardTransfer() {},
    async authorizeTaskPlacement() {},
    async authorizeTaskTrackingDerivedRead() {},
    async authorizeBackupGuard() {},
  } as unknown as ActorQueryPort;

  return { port, counts, authorizationTokens };
}

function vector(): number[] {
  const values = Array<number>(3072).fill(0);
  values[0] = 0.123456789;
  return values;
}

function provider(embed: (content: string, signal?: AbortSignal) => Promise<number[]>): RagProvider {
  return {
    embed,
    async generate() { return 'unused synthetic answer'; },
  };
}

function runnerFor(
  fake: ReturnType<typeof fakeWorkerPort>,
  options: { readonly unknownFirstCommit?: boolean } = {},
): { run: RagTransactionRunner; calls: () => number } {
  let calls = 0;
  const run: RagTransactionRunner = async operation => {
    calls += 1;
    const value = await operation(fake.port);
    if (options.unknownFirstCommit && calls === 1) {
      throw new KernelError('DB_COMMIT_UNKNOWN', 'Simulated unknown claim commit', 503);
    }
    return value;
  };
  return { run, calls: () => calls };
}

test('embedding vectors require 3072 finite float32 values and a nonzero direction', () => {
  const values = vector();
  const normalized = validatedRagVector(values);
  assert.equal(normalized.length, 3072);
  assert.equal(normalized[0], Math.fround(values[0]!));
  assert.equal(normalized.some(value => value !== 0), true);

  assert.throws(() => validatedRagVector(values.slice(1)), error => code(error) === 'RAG_PROVIDER_INVALID_RESPONSE');
  assert.throws(() => validatedRagVector(Array<number>(3072).fill(0)), error => code(error) === 'RAG_PROVIDER_INVALID_RESPONSE');
  assert.throws(() => validatedRagVector(Array.from({ length: 3072 }, (_, index) => index === 2 ? Number.NaN : 1)),
    error => code(error) === 'RAG_PROVIDER_INVALID_RESPONSE');
  assert.throws(() => validatedRagVector(Array.from({ length: 3072 }, (_, index) => index === 2 ? 1e100 : 1)),
    error => code(error) === 'RAG_PROVIDER_INVALID_RESPONSE');
});

test('an already-aborted indexing request performs no transaction and no provider call', async () => {
  const fake = fakeWorkerPort();
  const runner = runnerFor(fake);
  const controller = new AbortController();
  controller.abort();
  let embedCalls = 0;

  await assert.rejects(
    indexVisibleRagDocuments(runner.run, SCOPE, provider(async () => { embedCalls += 1; return vector(); }), controller.signal),
    error => code(error) === 'RAG_TIMEOUT',
  );
  assert.equal(runner.calls(), 0);
  assert.equal(embedCalls, 0);
});

test('unknown claim commit reads back the same lease token without a second claim', async () => {
  const fake = fakeWorkerPort();
  const runner = runnerFor(fake, { unknownFirstCommit: true });
  let embedCalls = 0;
  const outcome = await indexVisibleRagDocuments(runner.run, SCOPE,
    provider(async () => { embedCalls += 1; return vector(); }), new AbortController().signal, 1);

  assert.deepEqual(outcome, { embedded: 1 });
  assert.equal(embedCalls, 1);
  assert.equal(runner.calls(), 4, 'claim transaction, readback, revalidation, settle, with no second claim');
  assert.equal(fake.counts.candidateSelects, 1);
  assert.equal(fake.counts.claimRowLocks, 1);
  assert.equal(fake.counts.acquireUpdates, 1);
  assert.equal(fake.counts.embeddingWrites, 1);
  assert.equal(fake.counts.settleUpdates, 1);
  assert.ok(fake.authorizationTokens.length >= 4);
  assert.equal(new Set(fake.authorizationTokens).size, 1, 'Readback and settle must stay bound to the original claim');
  assert.match(fake.authorizationTokens[0]!, /^[a-f0-9]{64}$/u);
});

test('a provider failure is settled once and never automatically re-sent', async () => {
  const fake = fakeWorkerPort();
  const runner = runnerFor(fake);
  let embedCalls = 0;
  const outcome = await indexVisibleRagDocuments(runner.run, SCOPE, provider(async () => {
    embedCalls += 1;
    throw new Error('synthetic provider failure');
  }), new AbortController().signal, 1);

  assert.deepEqual(outcome, { embedded: 0 });
  assert.equal(embedCalls, 1);
  assert.equal(fake.counts.candidateSelects, 1);
  assert.equal(fake.counts.claimRowLocks, 1);
  assert.equal(fake.counts.acquireUpdates, 1);
  assert.equal(fake.counts.embeddingWrites, 0);
  assert.equal(fake.counts.settleUpdates, 1);
});

test('cancellation after provider start prevents vector writes and job settlement', async () => {
  const fake = fakeWorkerPort();
  const runner = runnerFor(fake);
  const controller = new AbortController();
  let embedCalls = 0;
  let startedResolve!: () => void;
  let finishResolve!: () => void;
  const started = new Promise<void>(resolve => { startedResolve = resolve; });
  const finish = new Promise<void>(resolve => { finishResolve = resolve; });
  const pending = indexVisibleRagDocuments(runner.run, SCOPE, provider(async () => {
    embedCalls += 1;
    startedResolve();
    await finish;
    return vector();
  }), controller.signal, 1);

  await started;
  controller.abort();
  finishResolve();
  await assert.rejects(pending, error => code(error) === 'RAG_TIMEOUT');
  assert.equal(embedCalls, 1);
  assert.equal(fake.counts.candidateSelects, 1);
  assert.equal(fake.counts.claimRowLocks, 1);
  assert.equal(fake.counts.acquireUpdates, 1);
  assert.equal(fake.counts.embeddingWrites, 0);
  assert.equal(fake.counts.settleUpdates, 0);
});
