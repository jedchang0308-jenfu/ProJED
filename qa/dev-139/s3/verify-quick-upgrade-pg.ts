import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import type { QuickTaskCreateReceipt } from '../../../server/quickTask.js';

interface BrowserProof {
  scope: string;
  captureId: string;
  ownerId: string;
  titleHash: string;
  clientCreatedAt: number;
  productSubmissions: number;
  explicitQaReplays: number;
  firstStatus: number;
  replayStatus: number;
  firstReceipt: QuickTaskCreateReceipt;
  replayReceipt: QuickTaskCreateReceipt;
}

/** Uses the existing nonce database/kernel. The original capture comes only
 * from the old real Quick UI; this verifier never seeds a task or receipt. */
export async function verifyQuickBackendUpgradePostgres(database: RuntimeDatabase, config: RuntimeConfig,
  base: string, owner: ServerActorV1, other: ServerActorV1): Promise<void> {
  const databaseUrl = new URL(config.databaseUrl);
  assert.equal(config.env, 'disposable');
  assert.equal(databaseUrl.hostname, '127.0.0.1');
  assert.match(databaseUrl.pathname, /^\/dev139_s3_[a-f0-9]{32}$/u);
  assert.equal(new URL(base).hostname, '127.0.0.1');
  const directory = resolve('output/playwright/dev-139-quick-pg');
  mkdirSync(directory, { recursive: true });
  const nonce = randomUUID();
  const proofPath = resolve(directory, nonce + '-browser.json');
  await new Promise<void>((done, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command',
      '& npm.cmd run verify:dev-141-manual-update -- --quick-backend-upgrade --legacy-source-root=output/dev139-quick-upgrade-source-A'], {
      cwd: process.cwd(), stdio: 'inherit', env: { ...process.env,
        PROJED_DEV139_QUICK_PG_BASE: base, PROJED_DEV139_QUICK_PG_OWNER: owner.localUserId,
        PROJED_DEV139_QUICK_PG_OTHER: other.localUserId, PROJED_DEV139_QUICK_PG_CONTEXT: owner.contextId,
        PROJED_DEV139_QUICK_PG_PROOF: proofPath },
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? done() : reject(new Error(`A06 live HTTP upgrade exited ${String(code)}`)));
  });
  const proof = JSON.parse(readFileSync(proofPath, 'utf8')) as BrowserProof;
  assert.equal(proof.scope, 'REAL_BROWSER_HTTP_ACK_PENDING_NATIVE_PG_READBACK_SYNTHETIC_IDENTITY');
  assert.match(proof.captureId, /^task_workbench_unplaced_[a-f0-9-]{36}$/u);
  assert.equal(proof.ownerId, owner.localUserId);
  assert.match(proof.titleHash, /^[a-f0-9]{64}$/u);
  assert.equal(proof.productSubmissions, 1);
  assert.equal(proof.explicitQaReplays, 1);
  assert.equal(proof.firstStatus, 201);
  assert.equal(proof.replayStatus, 200);
  assert.equal(proof.firstReceipt.created, true);
  assert.deepEqual(proof.replayReceipt, { ...proof.firstReceipt, created: false });
  assert.equal(proof.firstReceipt.captureId, proof.captureId);
  assert.equal(proof.firstReceipt.ownerId, owner.localUserId);
  assert.equal(proof.firstReceipt.titleHash, proof.titleHash);
  const rows = await runActorTransaction(database, config, owner, async port => {
    const task = await port.query<{ owner_id: string; legacy_task_id: string; app_id: string; title_hash: string }>(`
      SELECT owner_id::text, legacy_task_id, task->>'id' AS app_id,
             encode(sha256(convert_to(task->>'title','UTF8')),'hex') AS title_hash
        FROM projed_core.unplaced_tasks WHERE legacy_task_id=$1`, [proof.captureId]);
    const receipt = await port.query<{ owner_id: string; capture_id: string; title_hash: string; committed_at_ms: string }>(`
      SELECT owner_id::text,capture_id,title_hash,
             floor(extract(epoch FROM committed_at)*1000)::bigint::text AS committed_at_ms
        FROM projed_core.quick_task_capture_receipts WHERE capture_id=$1`, [proof.captureId]);
    return { tasks: task.rows, receipts: receipt.rows };
  });
  assert.deepEqual(rows.tasks, [{ owner_id: owner.localUserId, legacy_task_id: proof.captureId,
    app_id: proof.captureId, title_hash: proof.titleHash }]);
  assert.deepEqual(rows.receipts, [{ owner_id: owner.localUserId, capture_id: proof.captureId,
    title_hash: proof.titleHash, committed_at_ms: String(proof.firstReceipt.committedAt) }]);
  const denied = await runActorTransaction(database, config, other, async port => {
    const task = await port.query('SELECT legacy_task_id FROM projed_core.unplaced_tasks WHERE legacy_task_id=$1', [proof.captureId]);
    const receipt = await port.query('SELECT capture_id FROM projed_core.quick_task_capture_receipts WHERE capture_id=$1', [proof.captureId]);
    return { tasks: task.rows.length, receipts: receipt.rows.length };
  });
  assert.deepEqual(denied, { tasks: 0, receipts: 0 });
  writeFileSync(resolve(directory, nonce + '-reconciliation.json'), JSON.stringify({ status: 'PASS',
    evidenceLevel: 'A06_T05_REAL_BROWSER_KERNEL_HTTP_POSTGRES_SYNTHETIC_IDENTITY',
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    captureId: proof.captureId, ownerId: owner.localUserId, titleHash: proof.titleHash,
    clientCreatedAtPreservedInIndexedDb: proof.clientCreatedAt,
    firstStatus: 201, replayStatus: 200, productSubmissions: 1, explicitQaReplays: 1,
    uniqueTaskRows: rows.tasks.length, uniqueReceiptRows: rows.receipts.length,
    committedAt: proof.firstReceipt.committedAt, otherActorVisibleRows: denied,
    database: 'EXISTING_NONCE_CLUSTER', physicalInstalledPwa: 'NOT_RUN', providerIdentity: 'SYNTHETIC',
  }, null, 2) + '\n', { flag: 'wx' });
}
