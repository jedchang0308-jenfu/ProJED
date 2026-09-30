import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyQuickSyncError,
  isQuickCaptureReceipt,
  type QuickCaptureRecord,
} from '../src/features/quickTaskCapture/model';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const source = read('src/features/quickTaskCapture/auth.ts');
const main = read('src/quickTask/main.ts');
const client = read('src/services/supabase/client.ts');
const sync = read('src/features/quickTaskCapture/sync.ts');
const migration = read('supabase/migrations/20261001090000_dev_133_quick_rpc_security_invoker.sql');

assert.match(client, /detectSessionInUrl:\s*true/u, 'quick-task must use the ordinary Supabase callback parser');
assert.match(source, /getUser\(session\.access_token\)/u, 'network-backed user verification is required');
assert.match(source, /signOut\(\{\s*scope:\s*'local'\s*\}\)/u, 'quick-task logout must be local to this SDK session');
assert.doesNotMatch(source, /oauthClient|VITE_QUICK_TASK_OAUTH/u, 'retired custom OAuth branch must not be reachable');
assert.match(main, /pendingClaim/u, 'claim flow must wait for explicit account confirmation');
assert.match(main, /workspaceHint:\s*null/u, 'quick capture must not select a workspace in the browser');
assert.match(sync, /finishQuickCaptureLease\([\s\S]*result/u, 'sync must persist the backend receipt');
assert.match(migration, /security invoker/u, 'DEV-133 migration must restore invoker execution');
assert.match(migration, /set search_path\s*=\s*''/u, 'DEV-133 migration must keep an empty search path');

const baseRecord: QuickCaptureRecord = {
  schemaVersion: 1,
  captureId: 'task_workbench_unplaced_12345678-1234-4234-8234-123456789abc',
  accountId: 'user-a',
  title: '驗證回執',
  workspaceHint: null,
  clientCreatedAt: Date.now(),
  updatedAt: Date.now(),
  state: 'pending',
  attemptCount: 0,
  nextAttemptAt: null,
  lastErrorCode: null,
  leaseId: null,
  leaseExpiresAt: null,
  claimIntent: null,
};
const receipt = {
  status: 'committed' as const,
  captureId: baseRecord.captureId,
  ownerId: 'user-a',
  titleHash: 'a'.repeat(64),
  committedAt: Date.now(),
};
assert.equal(isQuickCaptureReceipt(receipt, baseRecord), true);
assert.equal(isQuickCaptureReceipt({ ...receipt, ownerId: 'user-b' }, baseRecord), false);
assert.equal(isQuickCaptureReceipt({ ...receipt, titleHash: 'not-a-hash' }, baseRecord), false);
assert.equal(classifyQuickSyncError({ status: 401 }), 'failed_auth');
assert.equal(classifyQuickSyncError({ status: 422 }), 'failed_permanent');
assert.equal(classifyQuickSyncError(new TypeError('Failed to fetch')), 'failed_retryable');

console.log(JSON.stringify({
  devId: 'DEV-133',
  status: 'PASS',
  checks: ['independent-supabase-session', 'network-user-verification', 'local-signout-barrier', 'explicit-claim-confirmation', 'receipt-integrity', 'invoker-migration'],
}));
