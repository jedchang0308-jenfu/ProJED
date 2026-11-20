import assert from 'node:assert/strict';
import pg from 'pg';
import { assertSourceAppWritesPaused, renderSourceAppWriteFence } from '../../../scripts/dev139-source-write-fence.js';

const url = new URL(process.env.PROJED_MIGRATION_SOURCE_DATABASE_URL ?? '');
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.pathname, /^\/dev139_source_[0-9a-f]{32}$/);
assert.equal(url.username, 'postgres');
const owner = new pg.Client({ connectionString: url.href });
const writer = new pg.Client({ connectionString: url.href });
const apply = renderSourceAppWriteFence('apply');
const remove = renderSourceAppWriteFence('remove');
const paused = { code: 'PT503', message: 'PROJED_SOURCE_WRITE_PAUSED' };
const incomplete = { code: 'SOURCE_APP_WRITES_NOT_PAUSED' };
try {
  await owner.connect();
  await writer.connect();
  await owner.query(`
    CREATE TABLE public.dev139_fence_probe (id integer PRIMARY KEY);
    GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.dev139_fence_probe TO authenticated;
  `);
  await writer.query('SET ROLE authenticated');
  await assert.rejects(assertSourceAppWritesPaused(owner), incomplete);
  await writer.query('BEGIN');
  await writer.query('INSERT INTO public.dev139_fence_probe VALUES (1)');
  // A previous writer must finish. A timeout rolls back every installed trigger.
  await assert.rejects(owner.query(apply), { code: '55P03' });
  await owner.query('ROLLBACK');
  await assert.rejects(assertSourceAppWritesPaused(owner), incomplete);
  await writer.query('COMMIT');
  await owner.query(apply);
  await assertSourceAppWritesPaused(owner);
  const read = () => writer.query('SELECT id FROM public.dev139_fence_probe ORDER BY id');
  assert.deepEqual((await read()).rows, [{ id: 1 }]);
  for (const sql of [
    'INSERT INTO public.dev139_fence_probe VALUES (2)',
    'UPDATE public.dev139_fence_probe SET id=2 WHERE id=1',
    'DELETE FROM public.dev139_fence_probe WHERE id=1',
    'TRUNCATE public.dev139_fence_probe',
  ]) await assert.rejects(writer.query(sql), paused);
  await owner.query("SET session_replication_role = 'replica'");
  await assert.rejects(owner.query('DELETE FROM public.dev139_fence_probe'), paused);
  await owner.query('RESET session_replication_role');
  await assert.rejects(owner.query(apply), { code: '42723' });
  await owner.query('ROLLBACK');
  await assertSourceAppWritesPaused(owner);
  await owner.query('BEGIN');
  await owner.query('ALTER TABLE public.dev139_fence_probe DISABLE TRIGGER projed_dev139_pause_business_writes');
  await assert.rejects(assertSourceAppWritesPaused(owner), incomplete);
  await owner.query('ROLLBACK');
  await owner.query(remove);
  await assert.rejects(assertSourceAppWritesPaused(owner), incomplete);
  await writer.query('INSERT INTO public.dev139_fence_probe VALUES (2)');
  assert.deepEqual((await read()).rows, [{ id: 1 }, { id: 2 }]);
  await owner.query('DROP TABLE public.dev139_fence_probe');
  console.log('DEV139_SOURCE_APP_WRITE_FENCE=PASS');
} finally {
  await Promise.allSettled([writer.end(), owner.end()]);
}
