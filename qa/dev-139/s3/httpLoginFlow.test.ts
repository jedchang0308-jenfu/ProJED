import assert from 'node:assert/strict';
import test from 'node:test';

import { startQuickGoogleSignIn } from '../../../src/features/quickTaskCapture/authHttp.js';
import { httpSessionService } from '../../../src/services/httpApi/backend.js';
import type { ProjedAppEntry } from '../../../src/services/httpApi/sessionAdapter.js';

function withLocation(origin: string, run: (assigned: string[]) => Promise<void>) {
  return async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousStartLogin = httpSessionService.startLogin;
    const assigned: string[] = [];
    const calls: Array<{ entry: ProjedAppEntry; returnPath?: string }> = [];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin, assign: (value: string) => assigned.push(value) } },
    });
    httpSessionService.startLogin = async (entry, returnPath) => {
      calls.push({ entry, returnPath });
      return 'https://broker.example.test/api/sso/authorize?validated=1';
    };
    try {
      await run(assigned);
      return calls;
    } finally {
      httpSessionService.startLogin = previousStartLogin;
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  };
}

test('same-origin Quick on the main production origin uses its main Session and keeps its return path', async () => {
  const run = withLocation('https://projed-cc78d.web.app', async assigned => {
    await startQuickGoogleSignIn('https://projed-cc78d.web.app/quick-task/?keep=1');
    assert.deepEqual(assigned, ['https://broker.example.test/api/sso/authorize?validated=1']);
  });
  assert.deepEqual(await run(), [{ entry: 'main', returnPath: '/quick-task/?keep=1' }]);
});

test('independent Quick production origin uses its own entry without navigating to Main', async () => {
  const run = withLocation('https://projed-cc78d.firebaseapp.com', async assigned => {
    await startQuickGoogleSignIn('https://projed-cc78d.firebaseapp.com/quick-task/?retry=1');
    assert.deepEqual(assigned, ['https://broker.example.test/api/sso/authorize?validated=1']);
  });
  assert.deepEqual(await run(), [{ entry: 'quick', returnPath: '/quick-task/?retry=1' }]);
});

test('local shared-origin Quick uses Main entry and rejects a foreign return URL', async () => {
  const run = withLocation('http://localhost:4173', async assigned => {
    await startQuickGoogleSignIn('http://localhost:4173/quick-task/?local=1');
    await assert.rejects(startQuickGoogleSignIn('https://evil.example.test/quick-task/'));
    assert.deepEqual(assigned, ['https://broker.example.test/api/sso/authorize?validated=1']);
  });
  assert.deepEqual(await run(), [{ entry: 'main', returnPath: '/quick-task/?local=1' }]);
});
