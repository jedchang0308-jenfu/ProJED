import assert from 'node:assert/strict';
import test from 'node:test';
import { OriginSwitchGuide, guideStorageKey, validateScope, type DraftInspection,
  type DestinationInspection, type GuidePorts, type GuideScope } from '../../../src/features/originSwitch/guide';

const scope: GuideScope = { campaign: 'test-v1', sourceOrigin: 'https://old.example.test',
  targetOrigin: 'https://new.example.test', accountId: 'original-account', entry: 'main' };
const clean: DraftInspection = { complete: true, online: true, editing: false, pending: 0, unknown: 0, conflicts: 0, unbound: 0 };
const proof: DestinationInspection = { ...scope, workspaceMatched: true, permissionsMatched: true, expiresAt: 2000 };
const memory = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
function fixture(patch: Partial<GuidePorts> = {}, selected = scope, storage = memory()) {
  const calls = { opened: [] as string[], installations: 0, accountReads: 0 };
  let drafts = { ...clean };
  let destination: DestinationInspection | null = { ...proof, ...selected };
  let now = 1000;
  const ports: GuidePorts = {
    inspectDrafts: async () => drafts,
    inspectDestination: async () => { calls.accountReads++; return destination; },
    openDestination: async url => { calls.opened.push(url); },
    requestInstall: async () => { calls.installations++; return 'accepted'; }, ...patch,
  };
  return { calls, storage, ports, guide: new OriginSwitchGuide(selected, [scope.targetOrigin], ports, storage, () => now),
    drafts: (next: Partial<DraftInspection>) => { drafts = { ...clean, ...next }; },
    destination: (next: DestinationInspection | null) => { destination = next; },
    time: (next: number) => { now = next; } };
}

test('clean cloud-only flow requires verified identity and an explicit new-entry confirmation', async () => {
  const f = fixture(); await f.guide.start(); assert.equal(f.guide.getSnapshot().stage, 'account');
  assert.equal(f.calls.accountReads, 0); await f.guide.openDestination();
  assert.deepEqual(f.calls.opened, ['https://new.example.test/']);
  assert.equal(f.guide.getSnapshot().stage, 'account'); // Opening a page is not verification.
  await f.guide.verifyAccount(); assert.equal(f.guide.getSnapshot().stage, 'entry');
  await f.guide.confirmEntry(false); assert.equal(f.guide.getSnapshot().stage, 'entry');
  await f.guide.confirmEntry(true); assert.equal(f.guide.getSnapshot().stage, 'complete');
});

test('pending, unknown, conflicting, unbound, editing and offline content block navigation without resending', async () => {
  for (const [patch, issue] of [
    [{ pending: 2 }, 'drafts'], [{ unknown: 1 }, 'unknown'], [{ conflicts: 1 }, 'conflict'],
    [{ unbound: 1 }, 'unbound'], [{ editing: true }, 'editing'], [{ online: false }, 'offline'],
    [{ complete: false }, 'unavailable'], [{ pending: NaN }, 'unavailable'],
  ] as const) {
    const f = fixture(); f.drafts(patch); await f.guide.start(); await f.guide.openDestination();
    assert.equal(f.guide.getSnapshot().stage, 'drafts'); assert.equal(f.guide.getSnapshot().issue, issue);
    assert.equal(f.calls.accountReads, 0); assert.equal(f.calls.opened.length, 0); assert.equal(f.calls.installations, 0);
  }
});

test('new edits appearing after the first check prevent departure and final completion', async () => {
  const f = fixture(); await f.guide.start(); f.drafts({ pending: 1 }); await f.guide.openDestination();
  assert.equal(f.calls.opened.length, 0); f.drafts({}); await f.guide.start(); await f.guide.verifyAccount();
  f.drafts({ unknown: 1 }); await f.guide.confirmEntry(true);
  assert.equal(f.guide.getSnapshot().stage, 'drafts'); assert.equal(f.guide.getSnapshot().issue, 'unknown');
});

test('wrong, cancelled, expired and wrong-scope destination evidence never completes the handoff', async () => {
  for (const [destination, issue] of [
    [null, 'login'], [{ ...proof, accountId: 'other-account' }, 'account'],
    [{ ...proof, expiresAt: 999 }, 'expired'], [{ ...proof, workspaceMatched: false }, 'access'],
    [{ ...proof, permissionsMatched: false }, 'access'], [{ ...proof, entry: 'quick' }, 'access'],
    [{ ...proof, sourceOrigin: 'https://other.example.test' }, 'access'],
    [{ ...proof, targetOrigin: 'https://evil.example.test' }, 'access'],
  ] as const) {
    const f = fixture(); f.destination(destination); await f.guide.start(); await f.guide.verifyAccount();
    assert.equal(f.guide.getSnapshot().stage, 'account'); assert.equal(f.guide.getSnapshot().issue, issue);
    await f.guide.confirmEntry(true); assert.equal(f.guide.getSnapshot().stage, 'account');
  }
});

test('destination unavailability keeps the source usable; a bounded later check can recover', async () => {
  let unavailable = true;
  const f = fixture({ inspectDestination: async () => { if (unavailable) throw Error('OFFLINE'); return proof; } });
  await f.guide.start(); await f.guide.verifyAccount(); assert.equal(f.guide.getSnapshot().issue, 'unavailable');
  f.guide.defer(); assert.equal(f.guide.getSnapshot().stage, 'intro');
  unavailable = false; await f.guide.start(); assert.equal(f.guide.getSnapshot().stage, 'entry');
});

test('accepted and dismissed installation events do not mark the guide complete', async () => {
  for (const outcome of ['accepted', 'dismissed', 'unavailable'] as const) {
    const f = fixture({ requestInstall: async () => outcome }); await f.guide.start(); await f.guide.verifyAccount();
    await f.guide.install(); assert.equal(f.guide.getSnapshot().install, outcome);
    assert.equal(f.guide.getSnapshot().stage, 'entry');
  }
});

test('expiring identity is rechecked before installation and final confirmation', async () => {
  const f = fixture(); await f.guide.start(); await f.guide.verifyAccount(); f.time(2001); await f.guide.install();
  assert.equal(f.calls.installations, 0); assert.equal(f.guide.getSnapshot().issue, 'expired');
  assert.equal(f.guide.getSnapshot().stage, 'account');
});

test('progress survives a restart but saved completion is not trusted without new evidence', async () => {
  const f = fixture(); await f.guide.start(); await f.guide.verifyAccount(); await f.guide.confirmEntry(true);
  f.guide.dispose();
  const resumed = fixture({}, scope, f.storage); resumed.destination(null);
  assert.equal(resumed.guide.getSnapshot().stage, 'intro'); assert.equal(resumed.guide.getSnapshot().deferred, true);
  await resumed.guide.start(); assert.equal(resumed.guide.getSnapshot().stage, 'account');
  resumed.destination(proof); await resumed.guide.verifyAccount(); await resumed.guide.confirmEntry(true);
  assert.equal(resumed.guide.getSnapshot().stage, 'complete');
});

test('main, Quick, account, campaign and origin all have distinct local progress', async () => {
  const f = fixture(); await f.guide.start(); await f.guide.verifyAccount(); await f.guide.confirmEntry(true);
  for (const patch of [{ entry: 'quick' }, { accountId: 'other' }, { campaign: 'test-v2' }, { sourceOrigin: 'https://old2.example.test' }] as const) {
    const nextScope = { ...scope, ...patch }; assert.notEqual(guideStorageKey(nextScope), guideStorageKey(scope));
    const next = fixture({}, nextScope, f.storage); await next.guide.start();
    assert.equal(next.guide.getSnapshot().stage, 'account'); assert.equal(next.calls.accountReads, 0);
  }
});

test('a late login response cannot complete a disposed account scope', async () => {
  let release!: (value: DestinationInspection) => void;
  const pending = new Promise<DestinationInspection>(resolve => { release = resolve; });
  const f = fixture({ inspectDestination: () => pending }); await f.guide.start();
  const request = f.guide.verifyAccount(); await new Promise(resolve => setImmediate(resolve));
  f.guide.dispose(); const other = fixture({}, { ...scope, accountId: 'other' }, f.storage);
  release(proof); await request;
  assert.notEqual(JSON.parse(f.storage.getItem(f.guide.key)!).stage, 'complete');
  assert.equal(other.guide.getSnapshot().stage, 'intro');
});

test('Later fences an in-flight inspection and does not open a page', async () => {
  let release!: (value: DraftInspection) => void;
  const f = fixture({ inspectDrafts: () => new Promise(resolve => { release = resolve; }) });
  const start = f.guide.start(); f.guide.defer(); release(clean); await start;
  assert.equal(f.guide.getSnapshot().stage, 'intro'); assert.equal(f.calls.opened.length, 0);
});

test('storage failure cannot produce a completed or untracked handoff', async () => {
  const f = fixture(); f.storage.setItem = () => { throw Error('QUOTA'); };
  await f.guide.start(); await f.guide.openDestination(); await f.guide.confirmEntry(true);
  assert.equal(f.guide.getSnapshot().issue, 'storage'); assert.equal(f.calls.opened.length, 0);
});

test('only a canonical approved HTTPS target is accepted, never a query-selected destination', () => {
  for (const targetOrigin of ['https://new.example.test.evil', 'http://new.example.test',
    'https://new.example.test/?return=https://evil.test', 'https://user@new.example.test', 'https://new.example.test/']) {
    assert.throws(() => validateScope({ ...scope, targetOrigin }, [scope.targetOrigin]));
  }
  const f = fixture({}, { ...scope, entry: 'quick' });
  return f.guide.start().then(() => f.guide.openDestination()).then(() => {
    assert.deepEqual(f.calls.opened, ['https://new.example.test/quick-task/']);
  });
});

test('stored progress contains neither private draft content nor authentication material', async () => {
  const f = fixture(); await f.guide.start(); await f.guide.verifyAccount(); await f.guide.confirmEntry(true);
  const saved = JSON.parse(f.storage.getItem(f.guide.key)!);
  assert.deepEqual(Object.keys(saved).sort(), ['entryConfirmed', 'stage', 'version']);
});
