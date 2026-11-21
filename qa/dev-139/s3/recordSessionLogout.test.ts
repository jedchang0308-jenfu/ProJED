import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

async function authFixture(http: boolean, failLogout = false) {
  const output = await build({ stdin: { contents: `
    export {default as auth} from './src/store/useAuthStore';
    export * from './src/services/recordSessionProtection';
    export {saveEmergencyMeetingDraftSnapshot as save} from './src/services/meetingDraftRecoveryService';
    export const fixtureId=${JSON.stringify(randomUUID())};`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'auth-ports', setup(api) {
    api.onResolve({ filter: /.*/ }, args => {
      const name = path.basename(args.path);
      if (name === 'authService') return { path: 'auth', namespace: 'fixture' };
      if (name === 'backendMode') return { path: 'backend', namespace: 'fixture' };
      if (name === 'meetingDraftRecoveryService' && args.importer.endsWith('useAuthStore.ts')) return { path: 'clear', namespace: 'fixture' };
      return null;
    });
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path === 'backend'
      ? `export const isHttpBackend=${http}`
      : args.path === 'clear' ? 'export const clearMeetingDraftRecoveryForUser=async()=>true'
        : `export const authService={handleRedirectResult:async()=>null,onAuthStateChanged:()=>{},signOut:async()=>{${failLogout ? 'throw Error("fixture logout failed")' : ''}}}` }));
  } }] });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0]!.text).toString('base64')}`);
}

test('legacy/local-test logout and same-account login do not block original recovery writes', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { setItem: (key: string, value: string) => memory.set(key, value) } });
  try {
    const f = await authFixture(false);
    await Promise.resolve();
    f.auth.setState({ user: { uid: 'legacy-a' }, loading: false });
    await f.auth.getState().signOut();
    assert.equal(f.isRecordSessionLogout('legacy-a'), false);
    f.auth.setState({ user: { uid: 'legacy-a' }, loading: false });
    assert.equal(f.save({ schemaVersion: 2, scopeKey: 'legacy-a:ws:board:draft', ownerUserId: 'legacy-a', workspaceId: 'ws', boardId: 'board',
      draftId: 'draft', savedAt: Date.now(), writeSequence: 1, canonicalBaselineSignature: null, localSignature: 'signature',
      draft: { type: 'meeting', content: 'retained' }, contentCursorOffset: null, meetingActivities: [], appendedMeetingActivityIds: [] }), true);
    assert.equal(memory.size, 1);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (originalSession) Object.defineProperty(globalThis, 'sessionStorage', originalSession); else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

test('HTTP explicit logout remains marked until its fresh Session mount resumes recovery', async () => {
  const f = await authFixture(true);
  await Promise.resolve();
  f.auth.setState({ user: { uid: 'http-a', authContextId: 'context-a' }, loading: false });
  await f.auth.getState().signOut();
  assert.equal(f.isRecordSessionLogout('http-a'), true);
  f.cancelRecordSessionLogout('http-a');
  assert.equal(f.isRecordSessionLogout('http-a'), false);
});

test('failed remote HTTP logout retains the original owner and leaves the existing recovery choice usable', async () => {
  const f = await authFixture(true, true);
  await Promise.resolve();
  f.auth.setState({ user: { uid: 'http-a', authContextId: 'context-a' }, loading: false });
  await f.auth.getState().signOut();
  assert.equal(f.auth.getState().user.uid, 'http-a');
  assert.equal(f.auth.getState().loading, false);
  assert.equal(f.isRecordSessionLogout('http-a'), false);
});
