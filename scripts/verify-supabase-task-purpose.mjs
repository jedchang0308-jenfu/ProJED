import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

const {
  PROJED_TEST_SUPABASE_URL: url,
  PROJED_TEST_SUPABASE_ANON_KEY: anonKey,
  PROJED_TEST_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
} = process.env;
assert(url && anonKey && serviceRoleKey, 'Provide the isolated local Supabase URL and keys.');
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname),
  'This test creates and deletes a fixture and requires a local Supabase stack.',
);

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const vite = await createServer({
  configFile: false,
  envFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anonKey),
  },
});

const unwrap = ({ data, error }, action) => {
  assert.ifError(error && new Error(`${action}: ${error.code ?? error.status} ${error.message}`));
  return data;
};
const suffix = randomUUID();
const email = `projed-task-purpose-${suffix}@example.com`;
const password = `Test-${randomUUID()}-9a!`;
let userId;
let tenantId;
const failures = [];

try {
  const { supabase } = await vite.ssrLoadModule('/src/services/supabase/client.ts');
  const { supabaseNodeService } = await vite.ssrLoadModule('/src/services/supabase/projedService.ts');
  const { buildTaskPurposeUpdates, getTaskPurposeText } = await vite.ssrLoadModule('/src/utils/taskNoteRichContent.ts');
  const { taskNoteSnapshotFromNode } = await vite.ssrLoadModule('/src/utils/taskNotePersistence.ts');

  userId = unwrap(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create test user',
  ).user.id;
  unwrap(await supabase.auth.signInWithPassword({ email, password }), 'sign in as a normal user');
  unwrap(await supabase.from('profiles').upsert({ id: userId, email, display_name: 'Task purpose test' }), 'save profile');
  tenantId = unwrap(
    await supabase.rpc('create_tenant_with_owner', { tenant_name: `TEST-task-purpose-${suffix}` }),
    'create test workspace',
  ).id;
  const project = unwrap(await supabase.from('projects').insert({
    tenant_id: tenantId,
    name: 'TEST-任務目的',
  }).select('id').single(), 'create test board');
  const membership = { tenant_id: tenantId, project_id: project.id, user_id: userId };
  unwrap(await admin.from('project_members').upsert({ ...membership, role: 'owner' }),
    'configure the test user as a board member with edit permission');
  const legacyId = `node_test_${suffix}`;
  const item = unwrap(await supabase.from('wbs_items').insert({
    tenant_id: tenantId,
    project_id: project.id,
    legacy_node_id: legacyId,
    title: 'TEST-儲存任務目的',
  }).select('id').single(), 'create task with an empty note baseline');

  const reload = async () => {
    const nodes = await supabaseNodeService.listByProject(tenantId, project.id);
    return nodes.find(node => node.id === legacyId);
  };
  const makeSnapshot = (task, content) => taskNoteSnapshotFromNode(buildTaskPurposeUpdates(task, { content }));
  const save = (id, baseline, next) => supabaseNodeService.compareAndSetNotes(tenantId, project.id, id, baseline, next);

  const emptyTask = await reload();
  assert.deepEqual(taskNoteSnapshotFromNode(emptyTask).detailNotes, []);
  assert.equal(taskNoteSnapshotFromNode(emptyTask).description, null);
  const firstPurpose = '各產品都能使用，並保留既有內容。';
  const first = await save(legacyId, taskNoteSnapshotFromNode(emptyTask), makeSnapshot(emptyTask, firstPurpose));
  assert.equal(first.status, 'persisted');
  const firstReload = await reload();
  assert.equal(getTaskPurposeText(firstReload), firstPurpose);
  assert.equal(firstReload.description, firstPurpose);
  console.log('PASS 空備註及空白舊說明可儲存，重新讀取看板可讀回任務目的');

  const longPurpose = `任務目的含中文、標點與長文\n${'適用於各產品。'.repeat(3000)}`;
  const second = await save(item.id, taskNoteSnapshotFromNode(firstReload), makeSnapshot(firstReload, longPurpose));
  assert.equal(second.status, 'persisted');
  const secondReload = await reload();
  assert.equal(getTaskPurposeText(secondReload), longPurpose);
  assert.equal(secondReload.description, longPurpose);
  console.log('PASS 已有備註的任務可更新長文，並完整讀回');

  const baseline = taskNoteSnapshotFromNode(secondReload);
  const otherNote = { id: 'test_history', title: '歷程紀錄', content: '另一處剛更新的內容' };
  const concurrent = await save(legacyId, baseline, { ...baseline, detailNotes: [...baseline.detailNotes, otherNote] });
  assert.equal(concurrent.status, 'persisted');
  const stale = await save(legacyId, baseline, makeSnapshot(secondReload, '過期草稿'));
  assert.equal(stale.status, 'conflict');
  assert.deepEqual(stale.snapshot.detailNotes.at(-1), otherNote);
  const finalTask = await reload();
  assert.equal(getTaskPurposeText(finalTask), longPurpose);
  assert.deepEqual(finalTask.detailNotes.at(-1), otherNote);
  console.log('PASS 舊草稿收到 conflict，重新讀取仍保留最新任務目的與其他備註');

  const finalBaseline = taskNoteSnapshotFromNode(finalTask);
  const results = await Promise.all([
    save(item.id, finalBaseline, makeSnapshot(finalTask, '同時儲存 A')),
    save(item.id, finalBaseline, makeSnapshot(finalTask, '同時儲存 B')),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), ['conflict', 'persisted']);
  const winner = results.find(result => result.status === 'persisted');
  const latestTask = await reload();
  assert.equal(getTaskPurposeText(latestTask), winner.snapshot.description);
  console.log('PASS 同時送出兩筆寫入，只有一筆可用相同舊值完成更新');

  unwrap(await admin.from('project_members').update({ role: 'viewer' }).match(membership).select('user_id').single(),
    'remove the test user’s board edit permission');
  const denied = await save(item.id, taskNoteSnapshotFromNode(latestTask), makeSnapshot(latestTask, '無編輯權限'));
  assert.equal(denied.status, 'conflict');
  assert.equal(getTaskPurposeText(await reload()), winner.snapshot.description);
  console.log('PASS 僅有讀取權限的帳號無法改寫任務目的');
} catch (error) {
  failures.push(error);
} finally {
  const cleanup = [
    ...(tenantId ? [async () => unwrap(
      await admin.from('tenants').delete().eq('id', tenantId).select('id').single(), 'delete test workspace',
    )] : []),
    ...(userId ? [async () => unwrap(await admin.auth.admin.deleteUser(userId), 'delete test user')] : []),
  ];
  for (const remove of cleanup) {
    try { await remove(); } catch (error) { failures.push(error); }
  }
  try { await vite.close(); } catch (error) { failures.push(error); }
}
if (failures.length) throw new AggregateError(failures, 'Task purpose integration verification failed');
