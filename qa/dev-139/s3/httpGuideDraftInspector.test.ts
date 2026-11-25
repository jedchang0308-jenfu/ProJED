import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpGuideDraftInspector } from '../../../src/features/originSwitch/httpDraftInspector';
import { OriginSwitchGuide, type DraftInspection } from '../../../src/features/originSwitch/guide';
import type { inspectLocalDrafts } from '../../../src/features/originSwitch/localDraftInventory';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const captureId = 'task_workbench_unplaced_11111111-1111-4111-8111-111111111111';
const clean: DraftInspection = { complete: true, online: true, editing: false, pending: 0, unknown: 0, conflicts: 0, unbound: 0 };
const profile = { localUserId: accountId, email: null, displayName: null, createdAt: 1,
  expiresAt: Date.now() + 60_000, authContextId: 'main-context-1', entry: 'main' };
const receipt = { status: 'committed', captureId, ownerId: accountId, titleHash: 'a'.repeat(64), created: false, committedAt: 1 };

function fixture(sessionOverride: object = {}) {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (input, init) => {
    const path = String(input); requests.push({ path, init });
    return new Response(JSON.stringify({ data: path === '/api/v1/session' ? { ...profile, ...sessionOverride } : receipt }),
      { headers: { 'content-type': 'application/json' } });
  });
  client.bindExpectedActor({ accountId, contextId: profile.authContextId });
  const activity = { current: true, online: true, editing: false, revision: 'editor:1' };
  return { client, requests, activity, readActivity: () => ({ ...activity }) };
}

test('guide draft port verifies the real Session before same-key GET readback, using no mutation', async () => {
  const f = fixture();
  const inventory: typeof inspectLocalDrafts = async (scope, ports) => {
    assert.equal(scope.accountId, accountId);
    assert.equal(ports.activity().current, true);
    assert.deepEqual(await ports.readQuickReceipt!(captureId), receipt);
    return clean;
  };
  const inspect = createHttpGuideDraftInspector({ accountId, entry: 'main' }, 'main', f.client, f.readActivity, inventory);
  const guide = new OriginSwitchGuide({ accountId, entry: 'main', campaign: 'test',
    sourceOrigin: 'https://old.example.test', targetOrigin: 'https://new.example.test' }, ['https://new.example.test'], {
    inspectDrafts: inspect, inspectDestination: async () => null,
    openDestination: async () => { throw new Error('should not navigate yet'); }, requestInstall: async () => 'unavailable',
  }, { getItem: () => null, setItem() {} });
  await guide.start();
  assert.equal(guide.getSnapshot().stage, 'account');
  assert.deepEqual(f.requests.map(request => request.path), ['/api/v1/session', `/api/v1/quick-tasks/${captureId}/receipt`]);
  for (const request of f.requests) {
    assert.equal(request.init?.method, 'GET'); assert.equal(request.init?.body, undefined);
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.get('x-projed-expected-account-id'), accountId);
    assert.equal(headers.get('x-projed-expected-context-id'), profile.authContextId);
  }
});

test('wrong account, Session context and entry are denied before local draft inspection', async () => {
  for (const override of [{ localUserId: 'other' }, { authContextId: 'new-context' }, { entry: 'quick' }]) {
    const f = fixture(override); let scanned = false;
    const inspect = createHttpGuideDraftInspector({ accountId, entry: 'main' }, 'main', f.client, f.readActivity,
      async () => { scanned = true; return clean; });
    await assert.rejects(inspect(), /ACTOR_CHANGED/u);
    assert.equal(scanned, false);
  }
});

test('same-origin Quick retains its guide scope while verifying its existing Main Session', async () => {
  const f = fixture();
  const inspect = createHttpGuideDraftInspector({ accountId, entry: 'quick' }, 'main', f.client, f.readActivity,
    async (scope) => { assert.equal(scope.entry, 'quick'); return clean; });
  assert.equal((await inspect()).complete, true);
});

test('Session replacement while reading does not certify the previous account', async () => {
  const f = fixture();
  const inspect = createHttpGuideDraftInspector({ accountId, entry: 'main' }, 'main', f.client, f.readActivity,
    async (_scope, ports) => {
      f.client.bindExpectedActor({ accountId, contextId: 'same-account-new-session' });
      assert.equal(ports.activity().current, false);
      await assert.rejects(ports.readQuickReceipt!(captureId), /ACTOR_UNAVAILABLE/u);
      return { ...clean, complete: ports.activity().current };
    });
  assert.equal((await inspect()).complete, false);
});

test('offline inspection retains local evidence without starting network requests', async () => {
  const f = fixture(); f.activity.online = false;
  const inspect = createHttpGuideDraftInspector({ accountId, entry: 'main' }, 'main', f.client, f.readActivity,
    async (_scope, ports) => ({ ...clean, online: ports.activity().online, pending: 1 }));
  const result = await inspect();
  assert.equal(result.pending, 1); assert.equal(result.online, false); assert.equal(f.requests.length, 0);
});

test('edits arriving during Session verification prevent completion even when a scan returns clean', async () => {
  const f = fixture();
  const inspect = createHttpGuideDraftInspector({ accountId, entry: 'main' }, 'main', f.client, f.readActivity,
    async () => { f.activity.revision = 'editor:2'; return clean; });
  assert.equal((await inspect()).complete, false);
});
