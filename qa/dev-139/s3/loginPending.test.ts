import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { AuthStore, FirestoreUser } from '../../../src/types';

async function fixture(http = true) {
  const key = '__LOGIN_' + randomUUID().replaceAll('-', '');
  let resolveLogin!: (user: FirestoreUser | null) => void;
  let rejectLogin!: (error: Error) => void;
  let resolveBootstrap!: (user: FirestoreUser | null) => void;
  const pending = new Promise<FirestoreUser | null>((resolve, reject) => { resolveLogin = resolve; rejectLogin = reject; });
  const bootstrap = new Promise<FirestoreUser | null>(resolve => { resolveBootstrap = resolve; });
  const calls: AbortSignal[] = [];
  const ports = { signIn: (signal: AbortSignal) => { calls.push(signal); return pending; }, bootstrap };
  (globalThis as Record<string, unknown>)[key] = ports;
  const output = await build({ stdin: { contents: `export {default as auth} from './src/store/useAuthStore';
    export {HttpApiError} from './src/services/httpApi/httpApiClient';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'login-ports', setup(api) {
      api.onResolve({ filter: /(?:authService|backendMode|meetingDraftRecoveryService|recordSessionProtection)$/ }, args => ({ path: path.basename(args.path), namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: {
        authService: `export const authService={signInWithGoogle:globalThis.${key}.signIn,handleRedirectResult:()=>globalThis.${key}.bootstrap,onAuthStateChanged:()=>{},signOut:async()=>{}}`,
        backendMode: `export const isHttpBackend=${http}`,
        meetingDraftRecoveryService: 'export const clearMeetingDraftRecoveryForUser=async()=>{}',
        recordSessionProtection: 'export const markRecordSessionLogout=()=>{},cancelRecordSessionLogout=()=>{}',
      }[args.path]! }));
    } }],
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0]!.text).toString('base64')}`);
  const auth = mod.auth as { getState(): AuthStore; setState(state: Partial<AuthStore>): void };
  auth.setState({ loading: false });
  delete (globalThis as Record<string, unknown>)[key];
  return { auth, calls, resolveLogin, rejectLogin, resolveBootstrap, HttpApiError: mod.HttpApiError };
}

test('rapid repeated clicks create one login; redirect keeps the shell locked and late bootstrap cannot unlock it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture();
  const first = f.auth.getState().signInWithGoogle();
  await f.auth.getState().signInWithGoogle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.auth.getState().loading, false, 'keep the original login shell visible');
  assert.equal(f.auth.getState().signingIn, true);
  f.resolveLogin(null);
  await first;
  f.resolveBootstrap(null);
  await Promise.resolve();
  await f.auth.getState().signInWithGoogle();
  assert.equal(f.auth.getState().signingIn, true);
  assert.equal(f.calls.length, 1);
  t.mock.timers.tick(60_000);
  assert.equal(f.auth.getState().signingIn, false);
  assert.equal(f.calls[0]!.aborted, true);
  assert.match(f.auth.getState().error!, /登入未完成/);
});

test('timeout aborts a slow login and its late result cannot overwrite a newer attempt', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture();
  const first = f.auth.getState().signInWithGoogle();
  t.mock.timers.tick(60_000);
  const retry = f.auth.getState().signInWithGoogle();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0]!.aborted, true);
  assert.equal(f.calls[1]!.aborted, false);
  f.resolveLogin(null);
  await Promise.all([first, retry]);
  assert.equal(f.auth.getState().signingIn, true);
  t.mock.timers.tick(60_000);
});

test('a failed login unlocks for explicit retry without automatic resubmission', async () => {
  const f = await fixture();
  const first = f.auth.getState().signInWithGoogle();
  f.rejectLogin(new Error('網路連線失敗'));
  await first;
  assert.equal(f.auth.getState().signingIn, false);
  assert.equal(f.auth.getState().error, '網路連線失敗');
  assert.equal(f.calls.length, 1);
});

test('a competing-window 409 keeps the button locked without retrying', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture();
  const first = f.auth.getState().signInWithGoogle();
  f.rejectLogin(new f.HttpApiError('DB_BUSY', 409, null, false));
  await first;
  assert.equal(f.auth.getState().signingIn, true);
  assert.match(f.auth.getState().error!, /登入已在進行中/);
  await f.auth.getState().signInWithGoogle();
  assert.equal(f.calls.length, 1);
  t.mock.timers.tick(60_000);
  assert.equal(f.auth.getState().signingIn, false);
});

test('an existing valid Session finishes immediately and legacy/local login remains compatible', async () => {
  for (const http of [true, false]) {
    const f = await fixture(http);
    const first = f.auth.getState().signInWithGoogle();
    const user = { uid: 'same-account', email: null, displayName: null };
    f.resolveLogin(user);
    await first;
    assert.deepEqual(f.auth.getState().user, user);
    assert.equal(f.auth.getState().signingIn, false);
    assert.equal(f.auth.getState().loading, false);
  }
});
