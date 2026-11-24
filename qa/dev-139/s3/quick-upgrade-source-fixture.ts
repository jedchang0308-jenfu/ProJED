import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import pg from 'pg';
import type { RuntimeConfig } from '../../../server/config.js';
import type { ServerActorV1 } from '../../../server/actorTransaction.js';
import {
  TABLES, insertSnapshot, readSource, readTarget, snapshotId, snapshotTypes, validateSource,
} from '../../../scripts/dev139-data-migration.js';

type Rows = Map<string, Record<string, unknown>[]>;
type Capture = { captureId: string; title: string; workspaceHint: string | null };

/** Synthetic legacy RPC transport, real nonce PostgreSQL source commit, and the
 * production importer's exact two-domain projection/copy/reconciliation. This
 * does not run the full CLI or qualify a production source/fence/Storage. */
export async function startQuickUpgradeSourceFixture(config: RuntimeConfig, owner: ServerActorV1) {
  const raw = process.env.PROJED_QA_MEETING_ADMIN_URL;
  assert.ok(raw, 'Quick upgrade requires the existing disposable admin fixture');
  const url = new URL(raw), runtime = new URL(config.databaseUrl);
  assert.equal(config.env, 'disposable');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.hostname, runtime.hostname);
  assert.equal(url.pathname, runtime.pathname);
  assert.equal(url.port, String(config.binding.databasePort));
  assert.match(url.pathname, /^\/dev139_s3_[a-f0-9]{32}$/u);
  assert.equal(url.username, 'postgres');
  assert.ok(url.password && !url.search && !url.hash);
  const specs = TABLES.filter(spec => ['unplaced_tasks', 'quick_task_capture_receipts'].includes(spec.target));
  assert.equal(specs.length, 2);
  const admin = new pg.Client({ connectionString: raw, types: snapshotTypes });
  await admin.connect();
  let created = false, privateCreated = false, imported = false;
  let capture: Capture | null = null;
  let sourceCommits = 0;
  let migration: { sourceDigest: string; targetDigest: string; matches: boolean } | null = null;
  let sourceReceipt: { status: 'committed'; captureId: string; ownerId: string; titleHash: string; created: boolean; committedAt: number } | null = null;
  const prefix = '/' + randomUUID();
  const scoped = (snapshot: Rows): Rows => new Map([...snapshot].map(([name, rows]) => [name,
    rows.filter(row => row.owner_id === owner.localUserId
      && row[name === 'unplaced_tasks' ? 'legacy_task_id' : 'capture_id'] === capture?.captureId),
  ]));
  try {
    const existing = (await admin.query<{ task: string | null; receipt: string | null; private_exists: boolean }>(`
      SELECT to_regclass('public.task_workbench_unplaced_items')::text AS task,
             to_regclass('private.quick_task_capture_receipts')::text AS receipt,
             to_regnamespace('private') IS NOT NULL AS private_exists`)).rows[0]!;
    assert.equal(existing.task, null, 'Never replace another source fixture');
    assert.equal(existing.receipt, null, 'Never replace another source fixture');
    privateCreated = !existing.private_exists;
    await admin.query(`BEGIN;
      CREATE SCHEMA IF NOT EXISTS private;
      CREATE TABLE public.task_workbench_unplaced_items (
        owner_id uuid NOT NULL, id text NOT NULL, workspace_id text NOT NULL,
        task jsonb NOT NULL, sort_order double precision NOT NULL,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, PRIMARY KEY(owner_id,id));
      CREATE TABLE private.quick_task_capture_receipts (
        owner_id uuid NOT NULL, capture_id text NOT NULL, title_hash bytea NOT NULL,
        committed_at timestamptz NOT NULL, PRIMARY KEY(owner_id,capture_id));
      COMMIT;`);
    created = true;
  } catch (error) {
    await admin.query('ROLLBACK').catch(() => undefined); await admin.end(); throw error;
  }

  const commit = async (body: Record<string, unknown>) => {
    assert.deepEqual(Object.keys(body).sort(), ['p_capture_id', 'p_title', 'p_workspace_hint']);
    assert.equal(typeof body.p_capture_id, 'string');
    assert.match(body.p_capture_id as string, /^task_workbench_unplaced_[a-f0-9-]{36}$/u);
    assert.equal(typeof body.p_title, 'string');
    const title = (body.p_title as string).trim();
    assert.ok(title && Array.from(title).length <= 500);
    assert.ok(body.p_workspace_hint === null || typeof body.p_workspace_hint === 'string');
    const next = { captureId: body.p_capture_id as string, title, workspaceHint: body.p_workspace_hint as string | null };
    if (capture) { assert.deepEqual(next, capture); assert.ok(sourceReceipt); return sourceReceipt; }
    assert.equal(imported, false);
    await admin.query('BEGIN');
    try {
      const workspace = (await admin.query<{ legacy_workspace_id: string }>(`
        SELECT tenant.legacy_workspace_id FROM projed_core.tenants tenant
        JOIN projed_core.tenant_members member ON member.tenant_id=tenant.id
        WHERE member.user_id=$1::uuid AND member.status='active'
        ORDER BY tenant.id LIMIT 1`, [owner.localUserId])).rows[0]!;
      assert.ok(workspace?.legacy_workspace_id);
      const time = (await admin.query<{ timestamp: string; millis: string }>(`
        SELECT clock_timestamp() AS timestamp,
               floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS millis`)).rows[0]!;
      const task = { id: next.captureId, workspaceId: workspace.legacy_workspace_id,
        boardId: '__task_workbench_unplaced__', parentId: null, title, status: 'todo', nodeType: 'task',
        order: 0, createdAt: Number(time.millis), updatedAt: Number(time.millis), detailNotes: [
          { id: 'note_default', title: '任務目的', content: '' },
          { id: 'note_default_secondary', title: '備註', content: '' },
        ] };
      const hash = createHash('sha256').update(title).digest('hex');
      await admin.query(`INSERT INTO public.task_workbench_unplaced_items
        VALUES ($1::uuid,$2,$3,$4::jsonb,0,$5::timestamptz,$5::timestamptz)`,
      [owner.localUserId, next.captureId, workspace.legacy_workspace_id, JSON.stringify(task), time.timestamp]);
      const receipt = (await admin.query<{ committed_at_ms: string }>(`
        INSERT INTO private.quick_task_capture_receipts VALUES ($1::uuid,$2,decode($3,'hex'),$4::timestamptz)
        RETURNING floor(extract(epoch FROM committed_at)*1000)::bigint::text AS committed_at_ms`,
      [owner.localUserId, next.captureId, hash, time.timestamp])).rows[0]!;
      await admin.query('COMMIT');
      capture = next; sourceCommits++;
      sourceReceipt = { status: 'committed', captureId: next.captureId, ownerId: owner.localUserId,
        titleHash: hash, created: true, committedAt: Number(receipt.committed_at_ms) };
      return sourceReceipt;
    } catch (error) { await admin.query('ROLLBACK'); throw error; }
  };

  const importCommitted = async () => {
    assert.ok(capture && sourceReceipt, 'The old UI RPC must commit before snapshot/import');
    assert.equal(imported, false, 'Do not replay an unknown import');
    const source = new pg.Client({ connectionString: raw, types: snapshotTypes });
    const target = new pg.Client({ connectionString: raw, types: snapshotTypes });
    try {
      await Promise.all([source.connect(), target.connect()]);
      await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await source.query("SET LOCAL TIME ZONE 'UTC'");
      await source.query("SET LOCAL DateStyle = 'ISO, YMD'");
      await source.query('SET LOCAL extra_float_digits = 3');
      await validateSource(source);
      const snapshot = await readSource(source, specs);
      assert.equal(snapshot.get('unplaced_tasks')?.length, 1);
      assert.equal(snapshot.get('quick_task_capture_receipts')?.length, 1);
      await target.query('SET ROLE projed_importer_disposable');
      assert.equal((await target.query<{ role: string }>('SELECT current_user AS role')).rows[0]?.role, config.profile.roles.importer);
      await target.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await target.query("SET LOCAL TIME ZONE 'UTC'");
      await target.query("SET LOCAL DateStyle = 'ISO, YMD'");
      await target.query('SET LOCAL extra_float_digits = 3');
      const before = scoped(await readTarget(target, specs));
      assert.ok([...before.values()].every(rows => rows.length === 0), 'The target must not already own this source capture');
      await insertSnapshot(target, snapshot, specs);
      const sourceDigest = snapshotId(snapshot), targetDigest = snapshotId(scoped(await readTarget(target, specs)));
      assert.equal(targetDigest, sourceDigest);
      await target.query('COMMIT'); imported = true;
      migration = { sourceDigest, targetDigest, matches: true };
      return { sourceReceipt, sourceCommits, migration,
        evidenceScope: 'TWO_DOMAIN_PRODUCTION_PROJECTION_INSERT_DIGEST_SYNTHETIC_SOURCE_NOT_FULL_CLI' };
    } catch (error) {
      await target.query('ROLLBACK').catch(() => undefined); throw error;
    } finally {
      await source.query('ROLLBACK').catch(() => undefined);
      await Promise.all([source.end(), target.end()]);
    }
  };

  let queue: Promise<unknown> = Promise.resolve();
  const server = createServer({ maxHeaderSize: 4096, requestTimeout: 30_000 }, (request, response) => {
    const handle = async () => {
      try {
        assert.equal(request.method, 'POST');
        assert.ok([`${prefix}/commit`, `${prefix}/snapshot-import`].includes(request.url ?? ''));
        const chunks: Buffer[] = []; let size = 0;
        for await (const part of request) { size += part.length; assert.ok(size <= 16_384); chunks.push(part); }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        const result = request.url === `${prefix}/commit` ? await commit(body) : (assert.deepEqual(body, {}), await importCommitted());
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify(result));
      } catch {
        request.resume(); response.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ error: 'ISOLATED_QUICK_SOURCE_FIXTURE_FAILED' }));
      }
    };
    queue = queue.then(handle, handle);
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  } catch (error) { await admin.end(); throw error; }
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return {
    base: `http://127.0.0.1:${address.port}${prefix}`,
    proof: () => ({ capture, sourceReceipt, sourceCommits, imported, migration }),
    async close() {
      await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
      await queue;
      try {
        if (created) {
          await admin.query('DROP TABLE private.quick_task_capture_receipts; DROP TABLE public.task_workbench_unplaced_items;');
          if (privateCreated) await admin.query('DROP SCHEMA private');
        }
      } finally { await admin.end(); }
    },
  };
}
